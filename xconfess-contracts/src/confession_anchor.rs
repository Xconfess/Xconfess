//! confession_anchor.rs
//!
//! Issue #1343 — Non-linkable on-chain confession anchoring via Pedersen commitments.
//!
//! Replaces the previous raw-hash scheme with a blinded commitment approach:
//!   commitment = SHA-256(content || blinding_factor)
//!
//! What goes on-chain: only the commitment hash + ephemeral submitter pubkey.
//! What stays off-chain: content, blinding factor, real user identity.
//!
//! Non-linkability guarantees:
//!   1. Every commitment uses a fresh random blinding factor → unique on-chain value
//!      even for identical confession text.
//!   2. Submissions use ephemeral Stellar keypairs → no account-level linkage.
//!   3. The contract stores NO session IDs, user IDs, or IP-adjacent data.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::Hash,
    env, panic_with_error,
    symbol_short,
    BytesN, Env, Symbol,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const ANCHORS: Symbol = symbol_short!("ANCHORS");

// ── Error codes ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum AnchorError {
    AlreadyAnchored = 1,
    NotFound = 2,
    InvalidCommitment = 3,
    OpeningMismatch = 4,
}

impl From<AnchorError> for soroban_sdk::Error {
    fn from(e: AnchorError) -> Self {
        soroban_sdk::Error::from_contract_error(e as u32)
    }
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ConfessionAnchorContract;

#[contractimpl]
impl ConfessionAnchorContract {
    /// Anchor a Pedersen commitment on-chain.
    ///
    /// `commitment`    — SHA-256(content_bytes || blinding_factor_bytes)
    ///                   computed client-side, NEVER the raw content.
    /// `ephemeral_pub` — public key of the one-time keypair used to submit this tx.
    ///                   Stored for audit; the private key is discarded by the backend.
    ///
    /// Emits event: ("anchor", commitment) so indexers can track existence
    /// without the contract storing extra linkable metadata.
    pub fn anchor(env: Env, commitment: BytesN<32>, ephemeral_pub: BytesN<32>) {
        // Idempotency check — reject double-anchoring the same commitment.
        let anchors = env.storage().persistent();
        if anchors.has(&commitment) {
            panic_with_error!(&env, AnchorError::AlreadyAnchored);
        }

        // Store ledger sequence as timestamp proxy (no wall-clock on Soroban).
        let ledger_seq = env.ledger().sequence();
        anchors.set(&commitment, &(ephemeral_pub, ledger_seq));

        // Extend TTL so the anchor survives long-term.
        anchors.extend_ttl(&commitment, 100_000, 200_000);

        env.events()
            .publish((symbol_short!("anchor"),), (commitment, ledger_seq));
    }

    /// Returns true if a commitment has been anchored.
    pub fn verify(env: Env, commitment: BytesN<32>) -> bool {
        env.storage().persistent().has(&commitment)
    }

    /// Voluntary opening: prove that `commitment = SHA-256(content_hash || blinding)`.
    ///
    /// `content_hash` — SHA-256 of the original confession text (not the text itself).
    /// `blinding`     — the random 32-byte factor used when committing.
    ///
    /// Returns true if the opening is valid and the commitment exists on-chain.
    /// Does NOT reveal content — only proves the commitment was honestly formed.
    pub fn open(
        env: Env,
        commitment: BytesN<32>,
        content_hash: BytesN<32>,
        blinding: BytesN<32>,
    ) -> bool {
        if !env.storage().persistent().has(&commitment) {
            panic_with_error!(&env, AnchorError::NotFound);
        }

        // Re-derive commitment from disclosed inputs.
        let mut preimage = [0u8; 64];
        preimage[..32].copy_from_slice(content_hash.to_array().as_slice());
        preimage[32..].copy_from_slice(blinding.to_array().as_slice());

        let derived = env
            .crypto()
            .sha256(&soroban_sdk::Bytes::from_slice(&env, &preimage));

        // Compare derived commitment to the stored one.
        let derived_bytes: BytesN<32> = derived.into();
        if derived_bytes != commitment {
            panic_with_error!(&env, AnchorError::OpeningMismatch);
        }

        env.events()
            .publish((symbol_short!("opened"),), (commitment,));

        true
    }

    /// Returns the ledger sequence when the commitment was anchored (0 if not found).
    pub fn anchor_ledger(env: Env, commitment: BytesN<32>) -> u32 {
        let anchors = env.storage().persistent();
        if !anchors.has(&commitment) {
            return 0;
        }
        let (_, seq): (BytesN<32>, u32) = anchors.get(&commitment).unwrap();
        seq
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Events, Env};

    fn make_commitment(env: &Env, content: &[u8], blinding: &[u8]) -> BytesN<32> {
        let mut preimage = [0u8; 64];
        preimage[..content.len().min(32)].copy_from_slice(&content[..content.len().min(32)]);
        preimage[32..32 + blinding.len().min(32)]
            .copy_from_slice(&blinding[..blinding.len().min(32)]);
        env.crypto()
            .sha256(&soroban_sdk::Bytes::from_slice(env, &preimage))
            .into()
    }

    fn rand_bytes(env: &Env) -> BytesN<32> {
        // In tests use a fixed "random" value; in production, use env.crypto().
        BytesN::from_array(env, &[0xAB; 32])
    }

    #[test]
    fn test_anchor_and_verify() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ConfessionAnchorContract);
        let client = ConfessionAnchorContractClient::new(&env, &contract_id);

        let blinding = rand_bytes(&env);
        let commitment = make_commitment(&env, b"I ate the last slice of pizza", blinding.to_array().as_slice());
        let ephemeral = BytesN::from_array(&env, &[0x11; 32]);

        client.anchor(&commitment, &ephemeral);
        assert!(client.verify(&commitment));
    }

    #[test]
    fn test_different_content_different_commitment() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ConfessionAnchorContract);
        let client = ConfessionAnchorContractClient::new(&env, &contract_id);

        let blinding = rand_bytes(&env);
        let c1 = make_commitment(&env, b"confession one", blinding.to_array().as_slice());
        let c2 = make_commitment(&env, b"confession two", blinding.to_array().as_slice());

        // Same blinding factor, different content → different commitments.
        assert_ne!(c1, c2);
    }

    #[test]
    fn test_same_content_different_blinding_non_linkable() {
        let env = Env::default();

        // Identical content, fresh blinding each time → completely different commitments.
        let b1 = BytesN::from_array(&env, &[0x01; 32]);
        let b2 = BytesN::from_array(&env, &[0x02; 32]);

        let c1 = make_commitment(&env, b"I cheated on my exam", b1.to_array().as_slice());
        let c2 = make_commitment(&env, b"I cheated on my exam", b2.to_array().as_slice());

        // This is the critical non-linkability property.
        assert_ne!(c1, c2, "Same content + different blinding MUST produce different commitments");
    }

    #[test]
    fn test_double_anchor_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ConfessionAnchorContract);
        let client = ConfessionAnchorContractClient::new(&env, &contract_id);

        let blinding = rand_bytes(&env);
        let commitment = make_commitment(&env, b"test", blinding.to_array().as_slice());
        let ephemeral = BytesN::from_array(&env, &[0x22; 32]);

        client.anchor(&commitment, &ephemeral);

        let result = client.try_anchor(&commitment, &ephemeral);
        assert!(result.is_err());
    }

    #[test]
    fn test_valid_opening() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ConfessionAnchorContract);
        let client = ConfessionAnchorContractClient::new(&env, &contract_id);

        let content = b"I forgot to feed my fish for a week";
        let blinding_raw = [0xDE; 32];
        let blinding = BytesN::from_array(&env, &blinding_raw);

        let content_hash_bytes: BytesN<32> = env
            .crypto()
            .sha256(&soroban_sdk::Bytes::from_slice(&env, content))
            .into();

        let commitment = make_commitment(&env, content_hash_bytes.to_array().as_slice(), &blinding_raw);
        let ephemeral = BytesN::from_array(&env, &[0x33; 32]);

        client.anchor(&commitment, &ephemeral);
        assert!(client.open(&commitment, &content_hash_bytes, &blinding));
    }

    #[test]
    fn test_invalid_opening_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ConfessionAnchorContract);
        let client = ConfessionAnchorContractClient::new(&env, &contract_id);

        let blinding = rand_bytes(&env);
        let commitment = make_commitment(&env, b"real content", blinding.to_array().as_slice());
        let ephemeral = BytesN::from_array(&env, &[0x44; 32]);
        client.anchor(&commitment, &ephemeral);

        let wrong_content_hash = BytesN::from_array(&env, &[0xFF; 32]);
        let result = client.try_open(&commitment, &wrong_content_hash, &blinding);
        assert!(result.is_err(), "Wrong content hash must fail opening");
    }
}