#!/usr/bin/env node
'use strict';

/**
 * Shared high-confidence secret patterns for xConfess release safety checks.
 *
 * This module is dependency-free (plain Node) so it can run in CI before
 * dependencies are installed. It intentionally contains only *shapes* of
 * secrets, never real credentials. Allowlisted values come from the committed
 * synthetic-identity policy so "allowed" is a documented, reviewable list.
 */

const STRKEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STELLAR_SECRET_VERSION_BYTE = 18 << 3; // 'S' StrKey: 6-bit version 18

function crc16Xmodem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function base32Decode(value) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of String(value).toUpperCase()) {
    const index = STRKEY_ALPHABET.indexOf(char);
    if (index < 0) return null;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/**
 * StrKey checksum validation prevents arbitrary uppercase runs inside WASM or
 * other binary artifacts from being reported as Stellar secret seeds.
 */
function isValidStellarSecret(value) {
  const decoded = base32Decode(value);
  if (!decoded || decoded.length !== 35) return false;
  if (decoded[0] !== STELLAR_SECRET_VERSION_BYTE) return false;
  const payload = decoded.slice(0, 33);
  const expected = (decoded[33] << 8) | decoded[34];
  return crc16Xmodem(payload) === expected;
}

const HIGH_CONFIDENCE_RULES = [
  {
    id: 'private-key-block',
    name: 'PEM private key block',
    pattern: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
    remediation:
      'Remove the private key block from the artifact. Keys belong in secret storage, never in source, bundles, images, or archives. Rotate the key if it was ever published.',
  },
  {
    id: 'stellar-secret-seed',
    name: 'Stellar secret seed',
    pattern: /\bS[2-7A-Z]{55}\b/g,
    validate: isValidStellarSecret,
    remediation:
      'Remove the StrKey secret seed and load it from a secret manager at runtime. Revoke the account and move funds if the seed was published.',
  },
  {
    id: 'jwt',
    name: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    remediation:
      'Tokens grant authenticated access. Never bake them into artifacts; inject them at runtime and invalidate any token that was published.',
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI / Anthropic API key',
    pattern: /\bsk-(?:proj-|ant-)?[a-zA-Z0-9_-]{24,}\b/g,
    remediation:
      'Revoke and rotate the API key immediately, then supply it through the deployment secret store.',
  },
  {
    id: 'stripe-live-key',
    name: 'Stripe live secret key',
    pattern: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g,
    remediation:
      'Rotate the Stripe live key immediately. Use test keys or [REDACTED] placeholders in fixtures and documentation.',
  },
  {
    id: 'github-pat',
    name: 'GitHub personal access token',
    pattern: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b/g,
    remediation:
      'Revoke the token in GitHub developer settings and replace it with a short-lived installation token.',
  },
  {
    id: 'aws-secret-key',
    name: 'AWS secret access key',
    pattern: /\baws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    remediation:
      'Rotate the AWS credential pair and read it from the environment or an instance role instead of a bundle.',
  },
];

const GENERIC_SAFE_PLACEHOLDERS = [
  /\[REDACTED/i,
  /PLACEHOLDER/i,
  /YOUR[_-]?SECRET/i,
  /<stellar-/i,
  /^[SX]{50,}$/,
  /^S0{50,}$/,
  /^0{64}$/,
  /^0{63}[0-9a-fA-F]$/,
  /^sk-(?:proj-|ant-)?(?:REDACTED|EXAMPLE|X{8,})$/i,
  /^ghp_[X*]{36}$/i,
  /^sk_live_[X*]{24,}$/i,
];

function loadAllowedValues(syntheticPolicy) {
  const values = new Set();
  if (syntheticPolicy && Array.isArray(syntheticPolicy.allowed_placeholder_values)) {
    for (const value of syntheticPolicy.allowed_placeholder_values) {
      if (typeof value === 'string' && value.length > 0) values.add(value);
    }
  }
  return values;
}

function isAllowedMatch(match, allowedValues) {
  if (allowedValues && allowedValues.has(match)) return true;
  return GENERIC_SAFE_PLACEHOLDERS.some((regex) => regex.test(match));
}

/**
 * Find high-confidence secrets in a string or Buffer.
 *
 * Binary artifacts are decoded as latin1 so embedded string constants are
 * still scanned; checksum validation on StrKeys keeps false positives low.
 */
function findSecrets(input, options = {}) {
  const text = Buffer.isBuffer(input) ? input.toString('latin1') : String(input);
  const allowedValues = options.allowedValues || loadAllowedValues(options.syntheticPolicy);
  const findings = [];
  const seen = new Set();

  for (const rule of HIGH_CONFIDENCE_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] || match[0];
      if (isAllowedMatch(value, allowedValues)) continue;
      if (typeof rule.validate === 'function' && !rule.validate(value)) continue;

      const redacted = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '***';
      const dedupeKey = `${rule.id}:${redacted}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      findings.push({
        rule_id: rule.id,
        rule_name: rule.name,
        matched: redacted,
        remediation: rule.remediation,
      });
    }
  }
  return findings;
}

/** Build a valid synthetic Stellar secret seed at runtime for self-tests. */
function syntheticStellarSecret(seedByte = 0x11) {
  const payload = [STELLAR_SECRET_VERSION_BYTE];
  for (let i = 0; i < 32; i += 1) payload.push((seedByte + i) % 256);
  const checksum = crc16Xmodem(payload);
  payload.push((checksum >> 8) & 0xff, checksum & 0xff);

  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of payload) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += STRKEY_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) output += STRKEY_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

module.exports = {
  HIGH_CONFIDENCE_RULES,
  crc16Xmodem,
  base32Decode,
  isValidStellarSecret,
  loadAllowedValues,
  isAllowedMatch,
  findSecrets,
  syntheticStellarSecret,
};
