use soroban_sdk::{
    contractevent, contractimpl, contracttype, symbol, Env, String as SorobanString, Symbol,
    Storage,
};
use crate::{
    report_key, ERR_COOLDOWN_ACTIVE, ERR_DUPLICATE_REPORT, ERR_REASON_EMPTY, ERR_REASON_TOO_LONG,
};
use crate::events::{EVENT_VERSION_V1, EventNonceKey};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReportSubmittedEvent {
    pub confession_id: Symbol,
    pub actor: Symbol,
    pub reason: SorobanString,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
}

#[contractevent(topics = ["report"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReportSubmittedLedgerEvent {
    #[topic]
    pub confession_id: Symbol,
    #[topic]
    pub actor: Symbol,
    pub reason: SorobanString,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
}

pub struct ReportContract;

#[contractimpl]
impl ReportContract {
    // Cooldown window in seconds
    pub const COOLDOWN: u64 = 3600; // 1 hour
    // #403: hard bound for report reason payload.
    pub const MAX_REPORT_REASON_LEN: u32 = 128;

    fn latest_nonce_internal(env: &Env, confession_id: &Symbol) -> u64 {
        env.storage()
            .instance()
            .get(&ReportNonceKey::Stream(confession_id.clone()))
            .unwrap_or(0_u64)
    }

    fn bump_nonce(env: &Env, confession_id: &Symbol) -> u64 {
        let next = Self::latest_nonce_internal(env, confession_id)
            .checked_add(1)
            .expect("report event nonce overflow");

        env.storage()
            .instance()
            .set(&ReportNonceKey::Stream(confession_id.clone()), &next);

        next
    }

    // Backward-compatible entrypoint: uses a default bounded reason.
    pub fn submit_report(env: Env, actor: Symbol, confession_id: Symbol) -> Result<(), Symbol> {
        let default_reason = SorobanString::from_str(&env, "generic");
        Self::submit_report_with_reason(
            env,
            actor,
            confession_id,
            default_reason,
        )
    }

    // Submit a report with explicit reason (bounded for gas/indexer safety).
    pub fn submit_report_with_reason(
        env: Env,
        actor: Symbol,
        confession_id: Symbol,
        reason: SorobanString,
    ) -> Result<(), Symbol> {
        if reason.len() == 0 {
            return Err(symbol!(ERR_REASON_EMPTY));
        }
        if reason.len() > Self::MAX_REPORT_REASON_LEN {
            return Err(symbol!(ERR_REASON_TOO_LONG));
        }

        let storage = env.storage();
        let key = report_key(&actor, &confession_id);

        if let Some(last_timestamp) = storage.get::<_, u64>(&key) {
            let now = env.ledger().timestamp();
            if now - last_timestamp < Self::COOLDOWN {
                return Err(symbol!(ERR_COOLDOWN_ACTIVE));
            } else {
                return Err(symbol!(ERR_DUPLICATE_REPORT));
            }
        }

        // Save current timestamp for this actor-confession
        storage.set(&key, &env.ledger().timestamp());

         // Emit deterministic report lifecycle event with monotonic nonce.
         let nonce = events::bump_nonce(&env, events::EventNonceKey::Stream(confession_id.clone()));
         let payload = ReportSubmittedLedgerEvent {
             confession_id: confession_id.clone(),
             actor: actor.clone(),
             reason,
             event_version: events::EVENT_VERSION_V1,
             nonce,
             timestamp: env.ledger().timestamp(),
         };
        payload.publish(&env);

        Ok(())
    }

    // Read helper for reconciliation/indexers.
    pub fn latest_report_nonce(env: Env, confession_id: Symbol) -> u64 {
        Self::latest_nonce_internal(&env, &confession_id)
    }
}
