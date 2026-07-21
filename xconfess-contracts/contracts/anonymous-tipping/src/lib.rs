#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, Env, MuxedAddress, String as SorobanString,
};

/// Backend-facing stable error codes for tipping contract
/// These codes are exposed via Error::code() and must remain stable for consumer compatibility
pub mod codes {
    pub const INVALID_TIP_AMOUNT: u32 = 6001;
    pub const METADATA_TOO_LONG: u32 = 6002;
    pub const TOTAL_OVERFLOW: u32 = 6003;
    pub const NONCE_OVERFLOW: u32 = 6004;
    pub const UNAUTHORIZED: u32 = 6005;
    pub const CONTRACT_PAUSED: u32 = 6006;
    pub const RATE_LIMITED: u32 = 6007;
    pub const INVALID_RATE_LIMIT_CONFIG: u32 = 6008;
    pub const TOKEN_NOT_CONFIGURED: u32 = 6009;
    pub const SETTLEMENT_REPLAY: u32 = 6010;
    pub const SETTLEMENT_NOT_FOUND: u32 = 6011;
    pub const RECIPIENT_MISMATCH: u32 = 6012;
}

/// Error classification for backend retry strategy
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorClassification {
    Terminal,  // Invalid input, auth failure — do not retry
    Retryable, // Transient (pause, rate limit) — may retry with backoff
    Unknown,   // Treat as terminal, log for investigation
}

const EVENT_VERSION_V1: u32 = 1;

/// Typed error enum for the Anonymous Tipping contract
/// Each error has a stable backend-facing code (60xx series)
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    InvalidTipAmount = 1,
    MetadataTooLong = 2,
    TotalOverflow = 3,
    NonceOverflow = 4,
    Unauthorized = 5,
    ContractPaused = 6,
    RateLimited = 7,
    InvalidRateLimitConfig = 8,
    TokenNotConfigured = 9,
    SettlementReplay = 10,
    SettlementNotFound = 11,
    RecipientMismatch = 12,
}

impl Error {
    /// Get stable backend-facing error code for this error.
    /// These codes are used by off-chain services and must remain stable.
    pub fn code(&self) -> u32 {
        match self {
            Error::InvalidTipAmount => codes::INVALID_TIP_AMOUNT,
            Error::MetadataTooLong => codes::METADATA_TOO_LONG,
            Error::TotalOverflow => codes::TOTAL_OVERFLOW,
            Error::NonceOverflow => codes::NONCE_OVERFLOW,
            Error::Unauthorized => codes::UNAUTHORIZED,
            Error::ContractPaused => codes::CONTRACT_PAUSED,
            Error::RateLimited => codes::RATE_LIMITED,
            Error::InvalidRateLimitConfig => codes::INVALID_RATE_LIMIT_CONFIG,
            Error::TokenNotConfigured => codes::TOKEN_NOT_CONFIGURED,
            Error::SettlementReplay => codes::SETTLEMENT_REPLAY,
            Error::SettlementNotFound => codes::SETTLEMENT_NOT_FOUND,
            Error::RecipientMismatch => codes::RECIPIENT_MISMATCH,
        }
    }

    /// Human-readable message for this error
    pub fn message(&self) -> &'static str {
        match self {
            Error::InvalidTipAmount => "tip amount must be positive",
            Error::MetadataTooLong => "proof metadata too long",
            Error::TotalOverflow => "recipient total would overflow",
            Error::NonceOverflow => "settlement nonce would overflow",
            Error::Unauthorized => "caller not authorized",
            Error::ContractPaused => "contract is paused",
            Error::RateLimited => "rate limit exceeded",
            Error::InvalidRateLimitConfig => "invalid rate limit configuration",
            Error::TokenNotConfigured => "xlm token contract is not configured",
            Error::SettlementReplay => "settlement id reuse detected",
            Error::SettlementNotFound => "settlement receipt not found",
            Error::RecipientMismatch => "settlement recipient mismatch",
        }
    }

    /// Classify error for backend retry strategy
    pub fn classification(&self) -> ErrorClassification {
        match self {
            // Terminal: caller's responsibility to fix
            Error::InvalidTipAmount => ErrorClassification::Terminal,
            Error::MetadataTooLong => ErrorClassification::Terminal,
            Error::Unauthorized => ErrorClassification::Terminal,
            Error::InvalidRateLimitConfig => ErrorClassification::Terminal,
            Error::TokenNotConfigured => ErrorClassification::Terminal,
            Error::SettlementReplay => ErrorClassification::Terminal,
            Error::SettlementNotFound => ErrorClassification::Terminal,
            Error::RecipientMismatch => ErrorClassification::Terminal,

            // Retryable: transient state (pause, rate limit) may resolve
            Error::ContractPaused => ErrorClassification::Retryable,
            Error::RateLimited => ErrorClassification::Retryable,

            // Retryable: arithmetic overflow on recipient balance
            Error::TotalOverflow => ErrorClassification::Retryable,
            Error::NonceOverflow => ErrorClassification::Retryable,
        }
    }
}

#[contract]
pub struct AnonymousTipping;

/// Schema version constants for upgrade-safe migration.
/// SCHEMA_VERSION_INITIAL is the implicit version of any contract deployed
/// before explicit versioning was introduced.  SCHEMA_VERSION_CURRENT is the
/// version this WASM implements; `migrate()` brings storage up to this level.
pub const SCHEMA_VERSION_INITIAL: u32 = 1;
pub const SCHEMA_VERSION_CURRENT: u32 = 3;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    RecipientTotal(Address),
    SettlementNonce,
    Owner,
    XlmToken,
    IsPaused,
    RateLimitConfig,
    WalletWindow(Address),
    /// Tracks which schema version has been applied to this contract's storage.
    /// Absent → SCHEMA_VERSION_INITIAL (pre-versioning deployment).
    SchemaVersion,
    /// v2: global count of all successful tip settlements across all recipients.
    /// Absent (or 0) before `migrate()` is called.
    GlobalTipCount,
    /// v3: stores settlement receipt data keyed by settlement_id for replay
    /// detection and cross-contract receipt verification.
    SettlementReceipt(u64),
}

/// Persistent TTL for per-user and per-settlement data (in ledgers).
/// 31 days ≈ 44640 ledgers at ~1 minute per ledger on Stellar.
const PERSISTENT_TTL_LEDGERS: u32 = 44_640;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementReceipt {
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
    pub settlement_id: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitConfig {
    pub max_tips_per_window: u32,
    pub window_seconds: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WalletWindow {
    pub window_start: u64,
    pub tip_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementReceiptEvent {
    pub recipient: Address,
    pub event_version: u32,
    pub settlement_id: u64,
    pub amount: i128,
    pub proof_metadata: SorobanString,
    pub proof_present: bool,
    pub timestamp: u64,
}

#[contractevent(topics = ["tip_settl"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementEvent {
    #[topic]
    pub recipient: Address,
    pub event_version: u32,
    pub settlement_id: u64,
    pub amount: i128,
    pub proof_metadata: SorobanString,
    pub proof_present: bool,
    pub timestamp: u64,
}

#[contractevent(topics = ["tip_pause"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseChangedEvent {
    #[topic]
    pub actor: Address,
    pub paused: bool,
    pub reason: SorobanString,
    pub timestamp: u64,
}

#[contractimpl]
impl AnonymousTipping {
    pub const MAX_PROOF_METADATA_LEN: u32 = 128;
    pub const DEFAULT_MAX_TIPS_PER_WINDOW: u32 = 1_000;
    pub const DEFAULT_RATE_WINDOW_SECONDS: u64 = 60;

    /// Initialize the tipping contract
    pub fn init(env: Env, xlm_token: Address) {
        if env.storage().instance().has(&DataKey::SettlementNonce) {
            return;
        }

        env.storage().instance().set(&DataKey::XlmToken, &xlm_token);
        env.storage()
            .instance()
            .set(&DataKey::SettlementNonce, &0_u64);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().set(
            &DataKey::RateLimitConfig,
            &RateLimitConfig {
                max_tips_per_window: Self::DEFAULT_MAX_TIPS_PER_WINDOW,
                window_seconds: Self::DEFAULT_RATE_WINDOW_SECONDS,
            },
        );
    }

    /// Send anonymous tip to a recipient
    pub fn send_tip(
        env: Env,
        sender: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<u64, Error> {
        Self::send_tip_with_proof(env, sender, recipient, amount, None)
    }

    /// Send anonymous tip with optional bounded settlement proof metadata.
    pub fn send_tip_with_proof(
        env: Env,
        sender: Address,
        recipient: Address,
        amount: i128,
        proof_metadata: Option<SorobanString>,
    ) -> Result<u64, Error> {
        Self::assert_not_paused(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidTipAmount);
        }
        sender.require_auth();
        Self::assert_within_rate_limit(&env, &sender)?;

        let metadata = match proof_metadata {
            Some(value) => {
                if value.len() > Self::MAX_PROOF_METADATA_LEN {
                    return Err(Error::MetadataTooLong);
                }
                value
            }
            None => SorobanString::from_str(&env, ""),
        };

        let xlm_token = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::XlmToken)
            .ok_or(Error::TokenNotConfigured)?;
        if xlm_token != env.current_contract_address() {
            let token_recipient = MuxedAddress::from(recipient.clone());
            TokenClient::new(&env, &xlm_token).transfer(&sender, &token_recipient, &amount);
        }

        let previous = env
            .storage()
            .persistent()
            .get::<_, i128>(&DataKey::RecipientTotal(recipient.clone()))
            .unwrap_or(0_i128);
        let next_total = previous.checked_add(amount).ok_or(Error::TotalOverflow)?;
        env.storage()
            .persistent()
            .set(&DataKey::RecipientTotal(recipient.clone()), &next_total);
        // Extend TTL on persistent storage to prevent data loss
        env.storage().persistent().extend_ttl(
            &DataKey::RecipientTotal(recipient.clone()),
            PERSISTENT_TTL_LEDGERS,
            PERSISTENT_TTL_LEDGERS,
        );

        let settlement_id = env
            .storage()
            .instance()
            .get::<_, u64>(&DataKey::SettlementNonce)
            .unwrap_or(0_u64)
            .checked_add(1)
            .ok_or(Error::NonceOverflow)?;
        env.storage()
            .instance()
            .set(&DataKey::SettlementNonce, &settlement_id);

        // Store settlement receipt for replay detection and cross-contract
        // verification. This allows downstream consumers and other contracts
        // to verify a settlement occurred without re-processing events.
        let receipt = SettlementReceipt {
            recipient: recipient.clone(),
            amount,
            timestamp: env.ledger().timestamp(),
            settlement_id,
        };
        env.storage()
            .persistent()
            .set(&DataKey::SettlementReceipt(settlement_id), &receipt);
        env.storage().persistent().extend_ttl(
            &DataKey::SettlementReceipt(settlement_id),
            PERSISTENT_TTL_LEDGERS,
            PERSISTENT_TTL_LEDGERS,
        );

        SettlementEvent {
            recipient,
            event_version: EVENT_VERSION_V1,
            settlement_id,
            amount,
            proof_metadata: metadata.clone(),
            proof_present: !metadata.is_empty(),
            timestamp: receipt.timestamp,
        }
        .publish(&env);

        // Increment global tip counter when the v2 schema is active.
        // The key is absent on pre-migration contracts; we only write it when
        // it already exists so that the count is not spuriously created before
        // the owner has run `migrate()`.
        if env.storage().instance().has(&DataKey::GlobalTipCount) {
            let prev_count = env
                .storage()
                .instance()
                .get::<_, u64>(&DataKey::GlobalTipCount)
                .unwrap_or(0_u64);
            env.storage()
                .instance()
                .set(&DataKey::GlobalTipCount, &prev_count.saturating_add(1));
        }

        Ok(settlement_id)
    }

    /// Get tip history for a recipient
    pub fn get_tips(env: Env, recipient: Address) -> i128 {
        env.storage()
            .persistent()
            .get::<_, i128>(&DataKey::RecipientTotal(recipient))
            .unwrap_or(0_i128)
    }

    /// Return the cumulative tip amount received by an address.
    pub fn get_tip_balance(env: Env, recipient: Address) -> i128 {
        Self::get_tips(env, recipient)
    }

    pub fn xlm_token(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get::<_, Address>(&DataKey::XlmToken)
            .ok_or(Error::TokenNotConfigured)
    }

    /// Read helper used by backend indexers/reconciliation workers.
    pub fn latest_settlement_nonce(env: Env) -> u64 {
        env.storage()
            .instance()
            .get::<_, u64>(&DataKey::SettlementNonce)
            .unwrap_or(0_u64)
    }

    pub fn configure_controls(
        env: Env,
        caller: Address,
        max_tips_per_window: u32,
        window_seconds: u64,
    ) -> Result<(), Error> {
        caller.require_auth();

        if max_tips_per_window == 0 || window_seconds == 0 {
            return Err(Error::InvalidRateLimitConfig);
        }

        if let Some(owner) = env.storage().instance().get::<_, Address>(&DataKey::Owner) {
            if owner != caller {
                return Err(Error::Unauthorized);
            }
        } else {
            env.storage().instance().set(&DataKey::Owner, &caller);
        }

        env.storage().instance().set(
            &DataKey::RateLimitConfig,
            &RateLimitConfig {
                max_tips_per_window,
                window_seconds,
            },
        );

        Ok(())
    }

    pub fn pause(env: Env, caller: Address, reason: SorobanString) -> Result<(), Error> {
        Self::require_owner(&env, &caller)?;
        env.storage().instance().set(&DataKey::IsPaused, &true);
        PauseChangedEvent {
            actor: caller,
            paused: true,
            reason,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
        Ok(())
    }

    pub fn unpause(env: Env, caller: Address, reason: SorobanString) -> Result<(), Error> {
        Self::require_owner(&env, &caller)?;
        env.storage().instance().set(&DataKey::IsPaused, &false);
        PauseChangedEvent {
            actor: caller,
            paused: false,
            reason,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&DataKey::IsPaused)
            .unwrap_or(false)
    }

    pub fn get_rate_limit_config(env: Env) -> RateLimitConfig {
        env.storage()
            .instance()
            .get::<_, RateLimitConfig>(&DataKey::RateLimitConfig)
            .unwrap_or(RateLimitConfig {
                max_tips_per_window: Self::DEFAULT_MAX_TIPS_PER_WINDOW,
                window_seconds: Self::DEFAULT_RATE_WINDOW_SECONDS,
            })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Schema migration
    // ─────────────────────────────────────────────────────────────────────────

    /// Apply all pending schema migrations and return the new schema version.
    ///
    /// **Idempotent** — calling this multiple times is always safe; it is a
    /// no-op when the contract storage is already at `SCHEMA_VERSION_CURRENT`.
    ///
    /// Caller must be the contract owner.
    ///
    /// ## v1 → v2
    /// Introduces `GlobalTipCount` (u64): a global counter of all successful
    /// tip settlements.  Existing settlements are not back-filled — the counter
    /// starts at 0 on upgrade and increments from the first post-migration tip.
    /// Off-chain reconciliation should combine the pre-migration event log with
    /// the on-chain counter when a complete historical count is needed.
    ///
    /// ## v2 → v3
    /// Settlement receipts are now stored per-settlement_id for replay detection
    /// and cross-contract verification. No back-fill is needed — receipts are
    /// only written for post-migration settlements. The v3 code also adds TTL
    /// extension calls (`extend_ttl`) on persistent storage to prevent data
    /// loss on `RecipientTotal`, `WalletWindow`, and `SettlementReceipt` keys.
    ///
    /// ## Rollback
    /// Schema bumps are additive (new keys only, no existing key is removed or
    /// retyped).  Rolling back the WASM to v1 is safe: the v1 code simply
    /// ignores the new keys.  The `SchemaVersion` key will read as absent
    /// (treated as v1) under the old WASM, which is correct.
    pub fn migrate(env: Env, caller: Address) -> Result<u32, Error> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        let current_version = env
            .storage()
            .instance()
            .get::<_, u32>(&DataKey::SchemaVersion)
            .unwrap_or(SCHEMA_VERSION_INITIAL);

        if current_version >= SCHEMA_VERSION_CURRENT {
            return Ok(current_version);
        }

        // v1 → v2: initialise GlobalTipCount to 0 if not already present.
        if current_version < 2 && !env.storage().instance().has(&DataKey::GlobalTipCount) {
            env.storage()
                .instance()
                .set(&DataKey::GlobalTipCount, &0_u64);
        }

        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &SCHEMA_VERSION_CURRENT);

        Ok(SCHEMA_VERSION_CURRENT)
    }

    /// Return the current schema version stored on-chain.
    /// Returns `SCHEMA_VERSION_INITIAL` for contracts deployed before
    /// explicit versioning was introduced.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&DataKey::SchemaVersion)
            .unwrap_or(SCHEMA_VERSION_INITIAL)
    }

    /// Return the global count of all successful tip settlements since
    /// schema v2 migration was applied.  Returns 0 on pre-v2 contracts.
    pub fn global_tip_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get::<_, u64>(&DataKey::GlobalTipCount)
            .unwrap_or(0_u64)
    }

    /// Claim a settlement receipt by settlement_id for cross-contract
    /// verification and replay detection.
    ///
    /// Returns the receipt if the settlement_id exists, or an error if
    /// the settlement was never created or has expired from storage.
    ///
    /// ## Replay detection
    /// Backend consumers can call this function with a candidate
    /// settlement_id. If the receipt exists and the recipient matches,
    /// the settlement is authentic. If the receipt does not exist, the
    /// event should be treated as a replay or invalid.
    ///
    /// ## Cross-contract verification
    /// Other Soroban contracts can call this function to verify that a
    /// settlement occurred before releasing funds or granting access.
    pub fn claim_receipt(env: Env, settlement_id: u64) -> Result<SettlementReceipt, Error> {
        env.storage()
            .persistent()
            .get::<_, SettlementReceipt>(&DataKey::SettlementReceipt(settlement_id))
            .ok_or(Error::SettlementNotFound)
    }

    /// Verify that a specific settlement_id belongs to the given recipient.
    /// This is a convenience wrapper around `claim_receipt` that additionally
    /// checks the recipient field, returning `SettlementReceipt` on match
    /// or an appropriate error otherwise.
    pub fn verify_settlement(
        env: Env,
        settlement_id: u64,
        expected_recipient: Address,
    ) -> Result<SettlementReceipt, Error> {
        let receipt = Self::claim_receipt(env, settlement_id)?;
        if receipt.recipient != expected_recipient {
            return Err(Error::RecipientMismatch);
        }
        Ok(receipt)
    }

    fn require_owner(env: &Env, caller: &Address) -> Result<(), Error> {
        let owner = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Owner)
            .ok_or(Error::Unauthorized)?;
        if owner != *caller {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn assert_not_paused(env: &Env) -> Result<(), Error> {
        if Self::is_paused(env.clone()) {
            return Err(Error::ContractPaused);
        }
        Ok(())
    }

    fn assert_within_rate_limit(env: &Env, wallet: &Address) -> Result<(), Error> {
        let cfg = Self::get_rate_limit_config(env.clone());
        if cfg.max_tips_per_window == 0 || cfg.window_seconds == 0 {
            return Err(Error::InvalidRateLimitConfig);
        }

        let now = env.ledger().timestamp();
        let mut state = env
            .storage()
            .persistent()
            .get::<_, WalletWindow>(&DataKey::WalletWindow(wallet.clone()))
            .unwrap_or(WalletWindow {
                window_start: now,
                tip_count: 0,
            });

        let elapsed = now.saturating_sub(state.window_start);
        if elapsed >= cfg.window_seconds {
            state.window_start = now;
            state.tip_count = 0;
        }

        if state.tip_count >= cfg.max_tips_per_window {
            return Err(Error::RateLimited);
        }

        state.tip_count = state.tip_count.saturating_add(1);
        env.storage()
            .persistent()
            .set(&DataKey::WalletWindow(wallet.clone()), &state);
        env.storage().persistent().extend_ttl(
            &DataKey::WalletWindow(wallet.clone()),
            PERSISTENT_TTL_LEDGERS,
            PERSISTENT_TTL_LEDGERS,
        );
        Ok(())
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod tipping_adversarial;
#[cfg(test)]
mod tipping_fuzz;
