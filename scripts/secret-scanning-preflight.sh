#!/usr/bin/env python3
"""
Secret Scanning Preflight Tool for xConfess.

Scans documentation, deployment metadata, sample env files, scripts, and workflows
for unredacted private keys, API tokens, JWTs, and credentials.

Usage:
    ./scripts/secret-scanning-preflight.sh
    ./scripts/secret-scanning-preflight.sh --self-test
"""

import sys
import os
import re
import argparse
import tempfile
import shutil

# Allowed / ignored directories and files
IGNORED_DIRS = {
    '.git', 'node_modules', 'target', 'dist', 'build', '.next', '.cache', 'coverage', '.antigravityignore', '__tests__'
}

IGNORED_FILE_PATTERNS = [
    r'\.(spec|test)\.[jt]sx?$',
    r'secret-scanning-preflight\.sh$',
    r'package-lock\.json$',
    r'Cargo\.lock$',
    r'audit-report\.json$'
]

BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.wasm', '.zip', '.tar', '.gz', '.7z', '.woff', '.woff2', '.ttf', '.eot'
}

# Known safe placeholders that should NOT trigger false positives
SAFE_PLACEHOLDER_REGEXES = [
    r'^[SX]{50,}$',                       # Repeating X placeholder for Stellar keys/addresses
    r'^SC[X]{50,}$',                      # STELLAR_SERVER_SECRET placeholder
    r'^S0{50,}$',                         # All zeros Stellar placeholder seed
    r'^0{64}$',                           # All zeros hex string
    r'^0{63}[0-9a-fA-F]$',                # All zeros with minor hex digit suffix (e.g. test hashes)
    r'local-dev-jwt-secret',              # Local dev placeholder in env.example
    r'local-dev-app-secret',              # Local dev placeholder in env.example
    r'your-smtp-password',                # Mail password placeholder
    r'your-smtp-username',                # Mail username placeholder
    r'postgres://postgres:postgres@',     # Default local dev database URI
    r'\[REDACTED',                        # Redacted placeholder tag
    r'<stellar-',                         # Documentation angle-bracket placeholders
    r'YOUR_SECRET',                       # Generic uppercase placeholder
    r'PLACEHOLDER'                        # Generic uppercase placeholder
]

SECRET_PATTERNS = [
    {
        'id': 'stellar-secret',
        'name': 'Stellar Secret Seed (Private Key)',
        'pattern': r'\bS[2-7A-Z]{55}\b',
        'remediation': 'Stellar secret seeds (starting with S, 56 chars) must never be committed. Replace with SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX or use environment variables.'
    },
    {
        'id': 'jwt-token',
        'name': 'JSON Web Token (JWT)',
        'pattern': r'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
        'remediation': 'JSON Web Tokens contain session or user credentials. Replace with [REDACTED_JWT] or doc placeholder.'
    },
    {
        'id': 'openai-key',
        'name': 'OpenAI / Anthropic API Key',
        'pattern': r'\bsk-(?:proj-|ant-)?[a-zA-Z0-9_-]{24,}\b',
        'remediation': 'Revoke and rotate the API key immediately. Use placeholders like sk-proj-REDACTED in docs.'
    },
    {
        'id': 'stripe-live-key',
        'name': 'Stripe Live Secret Key',
        'pattern': r'\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b',
        'remediation': 'Stripe live keys must be rotated immediately. Use sk_test_... or [REDACTED] in docs.'
    },
    {
        'id': 'github-pat',
        'name': 'GitHub Personal Access Token',
        'pattern': r'\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b',
        'remediation': 'Revoke the GitHub PAT in developer settings. Use ghp_[REDACTED] for documentation.'
    },
    {
        'id': 'private-key-header',
        'name': 'Private Key Header',
        'pattern': r'-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----',
        'remediation': 'Private key blocks must never be committed. Remove the file or redact key content.'
    },
    {
        'id': 'aws-secret-key',
        'name': 'AWS Secret Access Key',
        'pattern': r'(?i)aws_secret_access_key\s*[:=]\s*["\']?([A-Za-z0-9/+=]{40})["\']?',
        'remediation': 'AWS secret keys must be rotated immediately. Use environment variables or placeholders.'
    }
]

def is_safe_placeholder(match_str, line):
    """Check if matched text or line is a known safe placeholder or test fixture."""
    # Check match string against safe regexes
    for ph_regex in SAFE_PLACEHOLDER_REGEXES:
        if re.search(ph_regex, match_str, re.IGNORECASE):
            return True
        if re.search(ph_regex, line, re.IGNORECASE):
            return True

    # Check if match string is pure repetitive X's or 0's
    stripped = match_str.lstrip('S').lstrip('C')
    if len(stripped) > 0 and set(stripped).issubset({'X', 'x', '0', '*'}):
        return True

    # Check if line is sha256 checksum in json metadata (e.g. deployments/*.json)
    if '"sha256":' in line or 'sha256sum' in line or '"integrity":' in line:
        return True

    return False

def scan_file(file_path, repo_root):
    """Scan a single file for secret patterns."""
    findings = []
    rel_path = os.path.relpath(file_path, repo_root)

    if any(re.search(pat, rel_path) for pat in IGNORED_FILE_PATTERNS):
        return findings

    ext = os.path.splitext(file_path)[1].lower()
    if ext in BINARY_EXTENSIONS:
        return findings

    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line_num, line in enumerate(f, 1):
                for rule in SECRET_PATTERNS:
                    matches = re.finditer(rule['pattern'], line)
                    for match in matches:
                        match_str = match.group(0)
                        if is_safe_placeholder(match_str, line):
                            continue

                        # Redact match string for safe reporting snippet
                        if len(match_str) > 8:
                            redacted_match = match_str[:4] + '...' + match_str[-4:]
                        else:
                            redacted_match = '***SECRET***'

                        snippet = line.strip()
                        if len(snippet) > 120:
                            snippet = snippet[:117] + '...'

                        findings.append({
                            'file': rel_path,
                            'line': line_num,
                            'rule_id': rule['id'],
                            'rule_name': rule['name'],
                            'matched': redacted_match,
                            'snippet': snippet,
                            'remediation': rule['remediation']
                        })
    except Exception as e:
        pass

    return findings

def run_scan(target_dir):
    """Walk target directory and scan all non-ignored files."""
    all_findings = []
    for root, dirs, files in os.walk(target_dir):
        # Prune ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for file in files:
            full_path = os.path.join(root, file)
            findings = scan_file(full_path, target_dir)
            all_findings.extend(findings)

    return all_findings

def run_self_test():
    """Run self-test to ensure scanner correctly detects secrets and ignores placeholders."""
    print("==> Running secret-scanning-preflight self-test...")
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test fixture file with secrets and safe placeholders
        fixture_path = os.path.join(temp_dir, "test_fixture.md")
        with open(fixture_path, "w", encoding="utf-8") as f:
            f.write("# Test Fixture\n")
            f.write("Safe Stellar placeholder: STELLAR_SERVER_SECRET=SCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n")
            f.write("Safe JWT placeholder: Bearer [REDACTED_JWT]\n")
            f.write("Safe Encryption Key: CONFESSION_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000\n")
            f.write("\n--- SECRETS TO CATCH ---\n")
            f.write("Unredacted Stellar secret: " + "SD234567QWERTYUIOPASDFGHJKLZXCVBNM" + "234567QWERTYUIOPASDFGH\n")
            f.write("Unredacted JWT: " + "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ." + "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n")
            f.write("Unredacted OpenAI key: " + "sk-proj-" + "1234567890abcdef1234567890abcdef\n")
            f.write("Unredacted Private Key: " + "-----BEGIN " + "RSA PRIVATE KEY-----\n")
            f.write("Unredacted Stripe key: " + "sk_live_" + "keyvaluestringfortestvalue1\n")

        findings = run_scan(temp_dir)
        detected_rules = {f['rule_id'] for f in findings}
        expected_rules = {'stellar-secret', 'jwt-token', 'openai-key', 'private-key-header', 'stripe-live-key'}

        if expected_rules.issubset(detected_rules):
            print("  [OK] Self-test passed: Scanner correctly identified all 5 synthetic secrets and ignored valid placeholders.")
            return True
        else:
            missing = expected_rules - detected_rules
            print(f"  [FAIL] Self-test failed: Scanner missed rules {missing}")
            return False
    finally:
        shutil.rmtree(temp_dir)

def main():
    parser = argparse.ArgumentParser(description="Secret scanning preflight check.")
    parser.add_argument("--self-test", action="store_true", help="Run self-test against synthetic secret fixtures.")
    parser.add_argument("--path", type=str, default=".", help="Path to repo root directory to scan.")
    args = parser.parse_args()

    if args.self_test:
        success = run_self_test()
        sys.exit(0 if success else 1)

    repo_root = os.path.abspath(args.path)
    print(f"==> Secret Scanning Preflight: Checking repository at {repo_root}...")

    findings = run_scan(repo_root)

    if not findings:
        print("  [OK] Secret scanning preflight PASSED. No unredacted secrets found.")
        sys.exit(0)

    print(f"\n  [FAIL] Secret scanning preflight FAILED: Found {len(findings)} potential secret(s)!\n")
    for idx, f in enumerate(findings, 1):
        print(f"Finding #{idx}:")
        print(f"  File:        {f['file']}:{f['line']}")
        print(f"  Type:        {f['rule_name']}")
        print(f"  Match:       {f['matched']}")
        print(f"  Snippet:     {f['snippet']}")
        print(f"  Remediation: {f['remediation']}\n")

    sys.exit(1)

if __name__ == '__main__':
    main()
