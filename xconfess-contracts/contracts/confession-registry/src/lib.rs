#![no_std]
#![allow(dead_code)]
#![allow(deprecated)]
#[cfg(test)]
#[path = "confession_reg_auth.rs"]
mod confession_reg_auth;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Symbol, Vec,
};

pub const MAX_AUTHOR_CONFESSIONS_PER_AUTHOR: u32 = 128;
pub const REGISTRY_PAYLOAD_TOO_LONG: &str = "registry payload too long";

#[path = "../../access_control.rs"]
mod access_control;
#[path = "../../emergency_pause/mod.rs"]
mod emergency_pause;
#[path = "../../error.rs"]
mod error;
#[path = "../../events.rs"]
pub mod events;
#[path = "../../governance/mod.rs"]
pub mod governance;
#[path = "../../pagination/report.rs"]
pub mod report_pagination;
// mod confession_reg_auth;

// ─── Data Types ───

/// Status of a confession in the registry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConfessionStatus {
    Active,
    Deleted,
    Flagged,
}

/// On-chain confession record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Confession {
    /// Auto-incrementing confession ID.
    pub id: u64,
    /// Address of the confession author.
    pub author: Address,
    /// 32-byte hash of the confession content.
    pub content_hash: BytesN<32>,
    /// Timestamp when the confession was created (ms since epoch).
    pub created_at: u64,
    /// Timestamp of the last update (0 if never updated).
    pub updated_at: u64,
    /// Current status of the confession.
    pub status: ConfessionStatus,
}

#[contractevent(topics = ["confession_created"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionCreatedEvent {
    #[topic]
    pub id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub author: Address,
    pub content_hash: BytesN<32>,
    pub correlation_id: Option<Symbol>,
}

#[contractevent(topics = ["confession_updated"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionUpdatedEvent {
    #[topic]
    pub id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub old_status: ConfessionStatus,
    pub new_status: ConfessionStatus,
    pub correlation_id: Option<Symbol>,
}

#[contractevent(topics = ["confession_deleted"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionDeletedEvent {
    #[topic]
    pub id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub actor: Address,
    pub correlation_id: Option<Symbol>,
}

/// Pagination result returned by `list_confessions`.
///
/// `has_next_page` is `true` when more items exist beyond this page.
/// `next_cursor` is the ID to pass as `cursor` on the next call; it is
/// `None` on the terminal page.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Page {
    pub items: Vec<Confession>,
    pub has_next_page: bool,
    pub next_cursor: Option<u64>,
}

/// Storage keys used by the contract.
#[contracttype]
pub enum DataKey {
    /// The next confession ID to assign.
    NextId,
    /// Stores a Confession by its ID.
    Confession(u64),
    /// Maps content_hash → confession_id for uniqueness checks.
    HashIndex(BytesN<32>),
    /// Tracks confession IDs owned by an author.
    AuthorConfessions(Address),
    /// Contract admin address.
    Admin,
    /// Per-caller sequencing nonce for replay protection.
    CallerNonce(Address),
    /// Event nonce for confession events.
    EventNonceConfession(u64),
    /// Storage schema version (absent means SCHEMA_VERSION_INITIAL).
    SchemaVersion,
}

/// Storage schema version for deployments predating explicit versioning.
pub const SCHEMA_VERSION_INITIAL: u32 = 1;
/// Current storage schema version. Bump alongside a `migrate()` arm whenever
/// the storage layout changes.
pub const SCHEMA_VERSION_CURRENT: u32 = 1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReplayError {
    InvalidNonce = 1,
}

fn expected_nonce(env: &Env, caller: &Address) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::CallerNonce(caller.clone()))
        .unwrap_or(1u64)
}

fn consume_nonce(env: &Env, caller: &Address, nonce: u64) -> Result<(), ReplayError> {
    let expected = expected_nonce(env, caller);
    if nonce != expected {
        return Err(ReplayError::InvalidNonce);
    }

    env.storage()
        .instance()
        .set(&DataKey::CallerNonce(caller.clone()), &(expected + 1));
    Ok(())
}

fn bump_confession_event_nonce(env: &Env, id: u64) -> u64 {
    let key = DataKey::EventNonceConfession(id);
    let next = env
        .storage()
        .instance()
        .get(&key)
        .unwrap_or(0u64)
        .checked_add(1)
        .expect("event nonce overflow");
    env.storage().instance().set(&key, &next);
    next
}

// ─── Contract ───

#[contract]
pub struct ConfessionRegistry;

#[contractimpl]
impl ConfessionRegistry {
    // ─── Initialization ───

    /// Initialize the contract with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &1u64);

        // Also initialize common access control
        access_control::init_owner(&env, &admin).expect("owner initialization failed");
    }

    // ─── Governance ───

    pub fn set_quorum(env: Env, threshold: u32) {
        let mut config = governance::get_config(&env);
        config.quorum_threshold = threshold;
        let owner = access_control::get_owner(&env)
            .expect("owner must exist before configuring governance");
        governance::set_config(&env, &owner, config);
    }

    pub fn gov_propose(
        env: Env,
        proposer: Address,
        action: governance::model::CriticalAction,
    ) -> u64 {
        governance::propose(&env, proposer, action)
    }

    pub fn gov_approve(env: Env, approver: Address, id: u64) {
        governance::approve(&env, approver, id)
    }

    pub fn gov_revoke(env: Env, actor: Address, id: u64) {
        governance::revoke(&env, actor, id)
    }

    pub fn gov_execute(env: Env, executor: Address, id: u64) {
        governance::execute(&env, executor, id)
    }

    // ─── Create ───

    /// Create a new confession.
    ///
    /// - `author`: the address creating the confession (must authorize).
    /// - `content_hash`: 32-byte hash of the confession content.
    /// - `timestamp`: client-provided timestamp.
    ///
    /// Returns the newly assigned confession ID.
    ///
    /// Emits: `("confession_created", id)` → `(author, content_hash, timestamp)`
    pub fn create_confession(
        env: Env,
        author: Address,
        content_hash: BytesN<32>,
        timestamp: u64,
    ) -> u64 {
        // Require author authorization
        author.require_auth();

        // Check if paused — use shared emergency pause module
        emergency_pause::assert_not_paused(&env).unwrap_or_else(|err| panic!("{}", err as u32));

        // Enforce uniqueness on content_hash
        if env
            .storage()
            .instance()
            .has(&DataKey::HashIndex(content_hash.clone()))
        {
            panic!("confession with this content hash already exists");
        }

        let mut author_ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::AuthorConfessions(author.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        if author_ids.len() >= MAX_AUTHOR_CONFESSIONS_PER_AUTHOR {
            panic!("{}", REGISTRY_PAYLOAD_TOO_LONG);
        }

        // Allocate ID
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1u64);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        // Build record
        let confession = Confession {
            id,
            author: author.clone(),
            content_hash: content_hash.clone(),
            created_at: timestamp,
            updated_at: 0,
            status: ConfessionStatus::Active,
        };

        // Persist
        env.storage()
            .instance()
            .set(&DataKey::Confession(id), &confession);
        env.storage()
            .instance()
            .set(&DataKey::HashIndex(content_hash.clone()), &id);

        // Track author → confession index
        author_ids.push_back(id);
        env.storage()
            .instance()
            .set(&DataKey::AuthorConfessions(author.clone()), &author_ids);

        // Emit event
        ConfessionCreatedEvent {
            id,
            event_version: events::EVENT_VERSION_V1,
            nonce: bump_confession_event_nonce(&env, id),
            timestamp,
            author,
            content_hash,
            correlation_id: None,
        }
        .publish(&env);

        id
    }

    // ─── Read ───

    /// Get a confession by ID.
    pub fn get_confession(env: Env, id: u64) -> Confession {
        env.storage()
            .instance()
            .get(&DataKey::Confession(id))
            .expect("confession not found")
    }

    /// Get a confession ID by its content hash.
    pub fn get_by_hash(env: Env, content_hash: BytesN<32>) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::HashIndex(content_hash))
            .expect("no confession with that hash")
    }

    /// Get all confession IDs for an author.
    pub fn get_author_confessions(env: Env, author: Address) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::AuthorConfessions(author))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// List confessions with cursor-based pagination.
    ///
    /// - `cursor`: exclusive lower bound (last seen ID). Pass `None` to start from the beginning.
    /// - `limit`: maximum number of items to return (capped at 50).
    ///
    /// Returns a `Page<Confession>` with `has_next_page` and `next_cursor` so callers
    /// can detect terminal pages without guessing.
    pub fn list_confessions(env: Env, cursor: Option<u64>, limit: u32) -> Page {
        let limit = limit.min(50) as u64;
        let start = cursor.unwrap_or(0) + 1;
        let total: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1u64)
            .saturating_sub(1);

        let mut items: Vec<Confession> = Vec::new(&env);
        let mut id = start;
        // Fetch up to limit+1 to detect whether a next page exists.
        while id <= total && items.len() as u64 <= limit {
            if let Some(c) = env
                .storage()
                .instance()
                .get::<DataKey, Confession>(&DataKey::Confession(id))
            {
                items.push_back(c);
            }
            id += 1;
        }

        let has_next_page = items.len() as u64 > limit;
        if has_next_page {
            items.pop_back();
        }

        let next_cursor = if has_next_page {
            items.last().map(|c| c.id)
        } else {
            None
        };

        Page {
            items,
            has_next_page,
            next_cursor,
        }
    }

    /// Get the total number of confessions created.
    pub fn get_total_count(env: Env) -> u64 {
        let next_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1u64);
        next_id - 1
    }

    /// Return the next valid nonce for a caller in sequenced mutation methods.
    pub fn get_expected_nonce(env: Env, caller: Address) -> u64 {
        expected_nonce(&env, &caller)
    }

    /// Replay-protected create_confession variant.
    pub fn create_confession_seq(
        env: Env,
        author: Address,
        content_hash: BytesN<32>,
        timestamp: u64,
        nonce: u64,
    ) -> Result<u64, ReplayError> {
        consume_nonce(&env, &author, nonce)?;
        Ok(Self::create_confession(
            env,
            author,
            content_hash,
            timestamp,
        ))
    }

    // ─── Update Status ───

    /// Update the status of a confession.
    ///
    /// Only the author or the contract admin can change status.
    ///
    /// Emits: `("confession_updated", id)` → `(old_status, new_status, timestamp)`
    pub fn update_status(
        env: Env,
        caller: Address,
        id: u64,
        new_status: ConfessionStatus,
        timestamp: u64,
    ) {
        caller.require_auth();

        // Check if paused — use shared emergency pause module
        emergency_pause::assert_not_paused(&env).unwrap_or_else(|err| panic!("{}", err as u32));

        let mut confession: Confession = env
            .storage()
            .instance()
            .get(&DataKey::Confession(id))
            .expect("confession not found");

        // Terminal-state guard — a deleted confession is immutable.
        // Prevents resurrection (Deleted → Active) and double-delete side effects.
        if confession.status == ConfessionStatus::Deleted {
            panic!("confession is deleted and cannot be updated");
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract not initialized");

        if caller != confession.author && caller != admin {
            panic!("unauthorized: only author or admin can update status");
        }

        let old_status = confession.status.clone();
        confession.status = new_status;
        confession.updated_at = timestamp;

        env.storage()
            .instance()
            .set(&DataKey::Confession(id), &confession);

        ConfessionUpdatedEvent {
            id,
            event_version: events::EVENT_VERSION_V1,
            nonce: bump_confession_event_nonce(&env, id),
            timestamp,
            old_status,
            new_status: confession.status,
            correlation_id: None,
        }
        .publish(&env);
    }

    /// Replay-protected update_status variant.
    pub fn update_status_seq(
        env: Env,
        caller: Address,
        id: u64,
        new_status: ConfessionStatus,
        timestamp: u64,
        nonce: u64,
    ) -> Result<(), ReplayError> {
        consume_nonce(&env, &caller, nonce)?;
        Self::update_status(env, caller, id, new_status, timestamp);
        Ok(())
    }

    // ─── Delete ───

    /// Soft-delete a confession (set status to Deleted).
    ///
    /// Only the author or admin can delete.
    ///
    /// Emits: `("confession_deleted", id)` → `(caller, timestamp)`
    pub fn delete_confession(env: Env, caller: Address, id: u64, timestamp: u64) {
        caller.require_auth();

        // Check if paused — use shared emergency pause module
        emergency_pause::assert_not_paused(&env).unwrap_or_else(|err| panic!("{}", err as u32));

        let mut confession: Confession = env
            .storage()
            .instance()
            .get(&DataKey::Confession(id))
            .expect("confession not found");

        // Terminal-state guard — prevents double-delete and misleading updated_at stamps.
        if confession.status == ConfessionStatus::Deleted {
            panic!("confession is already deleted");
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("contract not initialized");

        if caller != confession.author && caller != admin {
            panic!("unauthorized: only author or admin can delete");
        }

        confession.status = ConfessionStatus::Deleted;
        confession.updated_at = timestamp;

        env.storage()
            .instance()
            .set(&DataKey::Confession(id), &confession);

        ConfessionDeletedEvent {
            id,
            event_version: events::EVENT_VERSION_V1,
            nonce: bump_confession_event_nonce(&env, id),
            timestamp,
            actor: caller,
            correlation_id: None,
        }
        .publish(&env);
    }

    /// Replay-protected delete_confession variant.
    pub fn delete_confession_seq(
        env: Env,
        caller: Address,
        id: u64,
        timestamp: u64,
        nonce: u64,
    ) -> Result<(), ReplayError> {
        consume_nonce(&env, &caller, nonce)?;
        Self::delete_confession(env, caller, id, timestamp);
        Ok(())
    }

    // ─── Schema migration ───

    /// Apply all pending schema migrations and return the new schema version.
    ///
    /// **Idempotent** — safe to call repeatedly; a no-op once storage is at
    /// `SCHEMA_VERSION_CURRENT`. Caller must be the contract owner.
    ///
    /// Schema bumps are purely additive: rolling back to a prior WASM build
    /// is safe because it simply ignores the `SchemaVersion` key.
    pub fn migrate(env: Env, caller: Address) -> u32 {
        access_control::require_owner(&env, &caller).expect("caller must be the contract owner");

        let current_version = env
            .storage()
            .instance()
            .get::<_, u32>(&DataKey::SchemaVersion)
            .unwrap_or(SCHEMA_VERSION_INITIAL);

        if current_version >= SCHEMA_VERSION_CURRENT {
            return current_version;
        }

        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &SCHEMA_VERSION_CURRENT);

        SCHEMA_VERSION_CURRENT
    }

    /// Return the current schema version stored on-chain.
    /// Returns `SCHEMA_VERSION_INITIAL` for pre-versioning deployments.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&DataKey::SchemaVersion)
            .unwrap_or(SCHEMA_VERSION_INITIAL)
    }
}

// ─── Tests ───

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup() -> (Env, ConfessionRegistryClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ConfessionRegistry, ());
        let client = ConfessionRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let author = Address::generate(&env);

        client.initialize(&admin);

        (env, client, admin, author)
    }

    fn sample_hash(env: &Env, value: u8) -> BytesN<32> {
        let mut bytes: [u8; 32] = [0; 32];
        bytes[0] = value;
        BytesN::from_array(env, &bytes)
    }

    #[test]
    fn test_create_and_read_confession() {
        let (env, client, _admin, author) = setup();
        let hash = sample_hash(&env, 1);
        let ts: u64 = 1_700_000_000_000;

        let id = client.create_confession(&author, &hash, &ts);
        assert_eq!(id, 1);

        let conf = client.get_confession(&id);
        assert_eq!(conf.id, 1);
        assert_eq!(conf.author, author);
        assert_eq!(conf.content_hash, hash);
        assert_eq!(conf.created_at, ts);
        assert_eq!(conf.updated_at, 0);
        assert_eq!(conf.status, ConfessionStatus::Active);
    }

    #[test]
    fn test_get_by_hash() {
        let (env, client, _admin, author) = setup();
        let hash = sample_hash(&env, 2);
        let ts: u64 = 1_700_000_000_001;

        let id = client.create_confession(&author, &hash, &ts);
        let found_id = client.get_by_hash(&hash);
        assert_eq!(id, found_id);
    }

    #[test]
    #[should_panic(expected = "confession with this content hash already exists")]
    fn test_duplicate_content_hash_rejected() {
        let (env, client, _admin, author) = setup();
        let hash = sample_hash(&env, 3);

        client.create_confession(&author, &hash, &1_700_000_000_000);
        client.create_confession(&author, &hash, &1_700_000_000_001); // panic
    }

    #[test]
    fn test_author_confessions_index() {
        let (env, client, _admin, author) = setup();
        let hash1 = sample_hash(&env, 10);
        let hash2 = sample_hash(&env, 11);

        client.create_confession(&author, &hash1, &1_700_000_000_001);
        client.create_confession(&author, &hash2, &1_700_000_000_002);

        let ids = client.get_author_confessions(&author);
        assert_eq!(ids.len(), 2);
        assert_eq!(ids.get(0).unwrap(), 1);
        assert_eq!(ids.get(1).unwrap(), 2);
    }

    #[test]
    fn test_total_count() {
        let (env, client, _admin, author) = setup();

        assert_eq!(client.get_total_count(), 0);

        client.create_confession(&author, &sample_hash(&env, 20), &1_000);
        assert_eq!(client.get_total_count(), 1);

        client.create_confession(&author, &sample_hash(&env, 21), &2_000);
        assert_eq!(client.get_total_count(), 2);
    }

    #[test]
    fn test_update_status_by_author() {
        let (env, client, _admin, author) = setup();
        let hash = sample_hash(&env, 30);

        let id = client.create_confession(&author, &hash, &1_000);
        client.update_status(&author, &id, &ConfessionStatus::Flagged, &2_000);

        let conf = client.get_confession(&id);
        assert_eq!(conf.status, ConfessionStatus::Flagged);
        assert_eq!(conf.updated_at, 2_000);
    }

    #[test]
    fn test_update_status_by_admin() {
        let (env, client, admin, author) = setup();
        let hash = sample_hash(&env, 31);

        let id = client.create_confession(&author, &hash, &1_000);
        client.update_status(&admin, &id, &ConfessionStatus::Flagged, &2_000);

        let conf = client.get_confession(&id);
        assert_eq!(conf.status, ConfessionStatus::Flagged);
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_update_status_by_unauthorized_user() {
        let (env, client, _admin, author) = setup();
        let outsider = Address::generate(&env);
        let hash = sample_hash(&env, 32);

        let id = client.create_confession(&author, &hash, &1_000);
        client.update_status(&outsider, &id, &ConfessionStatus::Flagged, &2_000);
        // panic
    }

    #[test]
    fn test_delete_confession() {
        let (env, client, _admin, author) = setup();
        let hash = sample_hash(&env, 40);

        let id = client.create_confession(&author, &hash, &1_000);
        client.delete_confession(&author, &id, &3_000);

        let conf = client.get_confession(&id);
        assert_eq!(conf.status, ConfessionStatus::Deleted);
        assert_eq!(conf.updated_at, 3_000);
    }

    #[test]
    fn duplicate_update_nonce_is_rejected_and_state_is_unchanged() {
        let (env, client, _admin, author) = setup();
        let id = client.create_confession(&author, &sample_hash(&env, 42), &1_000);

        assert_eq!(client.get_expected_nonce(&author), 1);
        client
            .try_update_status_seq(&author, &id, &ConfessionStatus::Flagged, &2_000, &1)
            .unwrap()
            .unwrap();
        assert_eq!(client.get_expected_nonce(&author), 2);

        let replay =
            client.try_update_status_seq(&author, &id, &ConfessionStatus::Active, &3_000, &1);
        assert!(replay.is_err());

        let conf = client.get_confession(&id);
        assert_eq!(conf.status, ConfessionStatus::Flagged);
        assert_eq!(conf.updated_at, 2_000);
        assert_eq!(client.get_expected_nonce(&author), 2);
    }

    #[test]
    fn stale_delete_nonce_after_successful_update_is_rejected_without_state_change() {
        let (env, client, _admin, author) = setup();
        let id = client.create_confession(&author, &sample_hash(&env, 43), &1_000);

        client
            .try_update_status_seq(&author, &id, &ConfessionStatus::Flagged, &2_000, &1)
            .unwrap()
            .unwrap();

        let stale_delete = client.try_delete_confession_seq(&author, &id, &3_000, &1);
        assert!(stale_delete.is_err());

        let conf = client.get_confession(&id);
        assert_eq!(conf.status, ConfessionStatus::Flagged);
        assert_eq!(conf.updated_at, 2_000);
        assert_eq!(client.get_expected_nonce(&author), 2);
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_delete_by_unauthorized_user() {
        let (env, client, _admin, author) = setup();
        let outsider = Address::generate(&env);
        let hash = sample_hash(&env, 41);

        let id = client.create_confession(&author, &hash, &1_000);
        client.delete_confession(&outsider, &id, &2_000); // panic
    }

    #[test]
    #[should_panic(expected = "confession not found")]
    fn test_get_nonexistent_confession() {
        let (_env, client, _admin, _author) = setup();
        client.get_confession(&999);
    }

    #[test]
    fn test_governance_flow() {
        let (env, client, admin, _author) = setup();

        let new_admin = Address::generate(&env);
        let action = governance::model::CriticalAction::GrantAdmin(new_admin.clone());

        // Propose
        let id = client.gov_propose(&admin, &action);

        // Approve (default quorum is 1)
        client.gov_approve(&admin, &id);

        // Execute
        client.gov_execute(&admin, &id);

        // Verify
        let is_adm = env.as_contract(&client.address, || {
            access_control::is_admin(&env, &new_admin)
        });
        assert!(is_adm);
    }

    #[test]
    fn test_governance_quorum() {
        let (env, client, admin, _author) = setup();
        let admin2 = Address::generate(&env);

        // Grant second admin first
        let grant_id = client.gov_propose(
            &admin,
            &governance::model::CriticalAction::GrantAdmin(admin2.clone()),
        );
        client.gov_approve(&admin, &grant_id);
        client.gov_execute(&admin, &grant_id);

        // Set quorum to 2
        client.set_quorum(&2);

        let new_admin = Address::generate(&env);
        let action = governance::model::CriticalAction::GrantAdmin(new_admin.clone());

        let id = client.gov_propose(&admin, &action);

        // Approve 1/2
        client.gov_approve(&admin, &id);

        // Execute (should fail)
        let res = client.try_gov_execute(&admin, &id);
        assert!(res.is_err());
    }

    #[test]
    fn test_execute_without_quorum() {
        let (_env, client, admin, _author) = setup();
        client.set_quorum(&2);

        let id = client.gov_propose(&admin, &governance::model::CriticalAction::Pause);
        client.gov_approve(&admin, &id);
        let result = client.try_gov_execute(&admin, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_governance_revoke() {
        let (_env, client, admin, _author) = setup();
        let id = client.gov_propose(&admin, &governance::model::CriticalAction::Pause);

        client.gov_approve(&admin, &id);
        client.gov_revoke(&admin, &id);

        // Try to execute (should fail since 0/1 approvals now)
        let res = client.try_gov_execute(&admin, &id);
        assert!(res.is_err());
    }

    #[test]
    fn test_pause_via_governance() {
        let (env, client, admin, author) = setup();
        let hash = sample_hash(&env, 50);

        // Propose Pause
        let id = client.gov_propose(&admin, &governance::model::CriticalAction::Pause);
        client.gov_approve(&admin, &id);
        client.gov_execute(&admin, &id);

        // Try to create confession (should fail)
        let res = client.try_create_confession(&author, &hash, &1_000);
        assert!(res.is_err());

        // Unpause
        let id2 = client.gov_propose(&admin, &governance::model::CriticalAction::Unpause);
        client.gov_approve(&admin, &id2);
        client.gov_execute(&admin, &id2);

        // Try to create confession (should succeed)
        client.create_confession(&author, &hash, &2_000);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialization() {
        let (env, client, _admin, _author) = setup();
        let another = Address::generate(&env);
        client.initialize(&another); // should panic
    }

    #[test]
    fn author_confession_index_exact_limit_succeeds() {
        let (env, client, _admin, author) = setup();

        for seed in 0..MAX_AUTHOR_CONFESSIONS_PER_AUTHOR {
            let hash = sample_hash(&env, seed as u8);
            let id = client.create_confession(&author, &hash, &(1_000 + seed as u64));
            assert_eq!(id, seed as u64 + 1);
        }

        assert_eq!(
            client.get_total_count(),
            MAX_AUTHOR_CONFESSIONS_PER_AUTHOR as u64
        );
        assert_eq!(
            client.get_author_confessions(&author).len(),
            MAX_AUTHOR_CONFESSIONS_PER_AUTHOR
        );
    }

    #[test]
    #[should_panic(expected = "registry payload too long")]
    fn author_confession_index_limit_plus_one_rejected() {
        let (env, client, _admin, author) = setup();

        for seed in 0..MAX_AUTHOR_CONFESSIONS_PER_AUTHOR {
            let hash = sample_hash(&env, seed as u8);
            client.create_confession(&author, &hash, &(1_000 + seed as u64));
        }

        let hash = sample_hash(&env, MAX_AUTHOR_CONFESSIONS_PER_AUTHOR as u8);
        let _ = client.create_confession(&author, &hash, &9_999);
    }
}
