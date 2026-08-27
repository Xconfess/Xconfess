#![no_std]
#![allow(dead_code)]
#![allow(deprecated)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol, Vec,
};

// Reputation Decay Policy Constants
/// Epoch duration in seconds (7 days)
pub const EPOCH_DURATION: u64 = 604_800;
/// Decay rate per epoch (5% decay, meaning reputation retains 95% per epoch)
pub const DECAY_RATE_NUMERATOR: i128 = 95;
/// Denominator for decay rate calculation (95/100 = 0.95)
pub const DECAY_RATE_DENOMINATOR: i128 = 100;
/// Maximum number of epochs to apply in a single calculation (bounds gas costs)
pub const MAX_EPOCHS_PER_CALCULATION: u32 = 52; // 1 year max
/// Minimum reputation floor (reputation won't decay below this for positive rep)
pub const REPUTATION_FLOOR: i128 = 0;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    BadgeAlreadyOwned = 1,
    BadgeNotFound = 2,
    BadgeTypeAlreadyOwned = 3,
    NotAuthorized = 4,
    NotInitialized = 5,
    BadgeTypeMetadataNotFound = 6,
    /// Emergency pause is active; badge/reputation mutations are blocked
    /// until an admin unpauses. Read-only queries remain available.
    ContractPaused = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BadgeType {
    ConfessionStarter, // First confession posted
    PopularVoice,      // 100+ reactions received
    GenerousSoul,      // Tipped 10+ confessions
    CommunityHero,     // 50+ confessions posted
    TopReactor,        // 500+ reactions given
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BadgeTypeMetadata {
    pub name: String,
    pub description: String,
    pub criteria: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Badge {
    pub id: u64,
    pub badge_type: BadgeType,
    pub minted_at: u64,
    pub owner: Address,
}

/// Storage keys
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Total badge count
    BadgeCount,
    /// Badge by ID: StorageKey::Badge(badge_id) -> Badge
    Badge(u64),
    /// User's badges: StorageKey::UserBadges(owner) -> Vec<u64>
    UserBadges(Address),
    /// Badge type ownership: StorageKey::TypeOwnership(owner, badge_type) -> bool
    TypeOwnership(Address, BadgeType),
    /// Admin address
    Admin,
    /// Badge type metadata: StorageKey::BadgeTypeMetadata(badge_type) -> BadgeTypeMetadata
    BadgeTypeMetadata(BadgeType),
    /// User reputation: StorageKey::UserReputation(user) -> i128
    UserReputation(Address),
    /// Last reputation update timestamp: StorageKey::ReputationLastUpdate(user) -> u64
    /// Used for decay calculation to track when reputation was last updated
    ReputationLastUpdate(Address),
    /// Global epoch index: StorageKey::CurrentEpoch -> u32
    /// Incremented each time a global recalibration occurs
    CurrentEpoch,
    /// Emergency pause flag: StorageKey::Paused -> bool (absent means false)
    Paused,
    /// Storage schema version: StorageKey::SchemaVersion -> u32 (absent means SCHEMA_VERSION_INITIAL)
    SchemaVersion,
}

/// Storage schema version for deployments predating explicit versioning.
pub const SCHEMA_VERSION_INITIAL: u32 = 1;
/// Current storage schema version. Bump alongside a `migrate()` arm whenever
/// the storage layout changes.
pub const SCHEMA_VERSION_CURRENT: u32 = 1;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BadgeAction {
    Grant,
    Revoke,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BadgeEvent {
    pub event_version: u32,
    pub badge_id: u64,
    pub badge_type: u32,
    pub owner: Address,
    pub action: BadgeAction,
    pub timestamp: u64,
}

/// Event data for badge transfer
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BadgeTransferredData {
    pub badge_id: u64,
    pub from: Address,
    pub to: Address,
}

/// Event data for reputation adjustment
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationAdjustedData {
    pub user: Address,
    pub amount: i128,
    pub reason: String,
    pub timestamp: u64,
}

/// Event data for reputation decay
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationDecayedData {
    pub user: Address,
    pub old_reputation: i128,
    pub new_reputation: i128,
    pub epochs_applied: u32,
    pub timestamp: u64,
}

#[contract]
pub struct ReputationBadges;

// Helper functions
fn get_admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .persistent()
        .get(&StorageKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn is_authorized(env: &Env, caller: &Address) -> Result<bool, Error> {
    let admin = get_admin(env)?;
    Ok(admin == *caller)
}

fn is_paused_internal(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get(&StorageKey::Paused)
        .unwrap_or(false)
}

fn assert_not_paused(env: &Env) -> Result<(), Error> {
    if is_paused_internal(env) {
        return Err(Error::ContractPaused);
    }
    Ok(())
}

// Reputation decay helper functions

/// Get the current epoch index based on ledger timestamp
fn get_current_epoch(env: &Env) -> u32 {
    // Use contract initialization time as epoch 0 reference
    // For simplicity, we use a fixed reference timestamp (contract initialization)
    // In production, this could be stored and updated via governance
    let reference_timestamp: u64 = 0; // Epoch 0 starts at timestamp 0
    let current_timestamp = env.ledger().timestamp();
    ((current_timestamp - reference_timestamp) / EPOCH_DURATION) as u32
}

/// Calculate decayed reputation based on elapsed epochs
/// Uses bounded iteration to limit gas costs (max MAX_EPOCHS_PER_CALCULATION epochs)
fn calculate_decayed_reputation(reputation: i128, epochs_elapsed: u32) -> i128 {
    if epochs_elapsed == 0 || reputation == 0 {
        return reputation;
    }

    // Bound the number of epochs to apply for gas cost control
    let epochs_to_apply = core::cmp::min(epochs_elapsed, MAX_EPOCHS_PER_CALCULATION);

    let mut result = reputation;
    for _ in 0..epochs_to_apply {
        // Apply decay: result = result * DECAY_RATE_NUMERATOR / DECAY_RATE_DENOMINATOR
        result = (result * DECAY_RATE_NUMERATOR) / DECAY_RATE_DENOMINATOR;

        // Stop if we hit the floor (for positive reputation)
        if result <= REPUTATION_FLOOR && reputation > 0 {
            return REPUTATION_FLOOR;
        }

        // For negative reputation, apply decay in opposite direction (become less negative)
        // Negative reputation decays towards 0 as well
    }

    result
}

/// Apply reputation decay for a user and update their last update timestamp
/// Returns the new reputation after decay
fn apply_reputation_decay(env: &Env, user: &Address) -> i128 {
    let current_reputation = env
        .storage()
        .persistent()
        .get(&StorageKey::UserReputation(user.clone()))
        .unwrap_or(0i128);

    let last_update_key = StorageKey::ReputationLastUpdate(user.clone());
    let last_update: u64 = env
        .storage()
        .persistent()
        .get(&last_update_key)
        .unwrap_or(0u64);

    let current_timestamp = env.ledger().timestamp();

    // Calculate epochs elapsed
    let time_elapsed = current_timestamp.saturating_sub(last_update);

    let epochs_elapsed = (time_elapsed / EPOCH_DURATION) as u32;

    if epochs_elapsed == 0 {
        return current_reputation;
    }

    // Calculate decayed reputation
    let new_reputation = calculate_decayed_reputation(current_reputation, epochs_elapsed);

    // Update storage if reputation changed
    if new_reputation != current_reputation {
        env.storage()
            .persistent()
            .set(&StorageKey::UserReputation(user.clone()), &new_reputation);
    }

    // Always update the last update timestamp to current time
    env.storage()
        .persistent()
        .set(&last_update_key, &current_timestamp);

    new_reputation
}

/// Get user reputation with decay applied
fn get_user_reputation_with_decay(env: &Env, user: &Address) -> i128 {
    apply_reputation_decay(env, user)
}

/// Update reputation and reset the decay timer (called when reputation is explicitly changed)
fn update_reputation_and_reset_timer(env: &Env, user: &Address, new_reputation: i128) {
    env.storage()
        .persistent()
        .set(&StorageKey::UserReputation(user.clone()), &new_reputation);

    // Reset the last update timestamp to current time
    let last_update_key = StorageKey::ReputationLastUpdate(user.clone());
    env.storage()
        .persistent()
        .set(&last_update_key, &env.ledger().timestamp());
}

#[contractimpl]
impl ReputationBadges {
    /// Initialize the contract with an admin
    /// Must be called exactly once during contract deployment
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Admin) {
            return Err(Error::NotInitialized); // Already initialized
        }

        admin.require_auth();
        env.storage().persistent().set(&StorageKey::Admin, &admin);

        let event_topic = Symbol::new(&env, "contract_initialized");
        env.events().publish((event_topic, admin.clone()), admin);

        Ok(())
    }

    /// Get the current admin address
    pub fn get_admin(env: Env) -> Result<Address, Error> {
        get_admin(&env)
    }

    /// Transfer admin rights to a new address
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let current_admin = get_admin(&env)?;
        current_admin.require_auth();

        new_admin.require_auth();
        env.storage()
            .persistent()
            .set(&StorageKey::Admin, &new_admin);

        let event_topic = Symbol::new(&env, "admin_transferred");
        env.events().publish(
            (event_topic, current_admin.clone()),
            (current_admin, new_admin.clone()),
        );

        Ok(())
    }

    /// Pause the contract (admin only). Blocks badge and reputation
    /// mutations; read-only queries (get_badges, get_user_reputation, etc.)
    /// remain available while paused.
    pub fn pause(env: Env, reason: String) -> Result<(), Error> {
        let admin = get_admin(&env)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Paused, &true);

        let event_topic = Symbol::new(&env, "contract_paused");
        env.events().publish((event_topic, admin.clone()), reason);

        Ok(())
    }

    /// Unpause the contract (admin only).
    pub fn unpause(env: Env, reason: String) -> Result<(), Error> {
        let admin = get_admin(&env)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Paused, &false);

        let event_topic = Symbol::new(&env, "contract_unpaused");
        env.events().publish((event_topic, admin.clone()), reason);

        Ok(())
    }

    /// Check whether the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        is_paused_internal(&env)
    }

    /// Create or update metadata for a badge type (admin only)
    pub fn create_badge(
        env: Env,
        badge_type: BadgeType,
        name: String,
        description: String,
        criteria: String,
    ) -> Result<(), Error> {
        assert_not_paused(&env)?;

        let admin = get_admin(&env)?;
        admin.require_auth();

        let metadata = BadgeTypeMetadata {
            name,
            description,
            criteria,
        };

        env.storage().persistent().set(
            &StorageKey::BadgeTypeMetadata(badge_type.clone()),
            &metadata,
        );

        let event_topic = Symbol::new(&env, "badge_type_created");
        env.events()
            .publish((event_topic, admin.clone()), badge_type);

        Ok(())
    }

    /// Award a badge to a user (admin only)
    /// Returns the badge ID
    pub fn award_badge(env: Env, recipient: Address, badge_type: BadgeType) -> Result<u64, Error> {
        assert_not_paused(&env)?;

        let admin = get_admin(&env)?;
        admin.require_auth();

        // Check if recipient already has this badge type
        let ownership_key = StorageKey::TypeOwnership(recipient.clone(), badge_type.clone());
        if env.storage().persistent().has(&ownership_key) {
            return Err(Error::BadgeAlreadyOwned);
        }

        // Get and increment badge count
        let badge_count = Self::get_badge_count_internal(&env);
        let badge_id = badge_count + 1;
        env.storage()
            .persistent()
            .set(&StorageKey::BadgeCount, &badge_id);

        // Create badge
        let minted_at = env.ledger().timestamp();
        let badge = Badge {
            id: badge_id,
            badge_type: badge_type.clone(),
            minted_at,
            owner: recipient.clone(),
        };

        // Store badge
        env.storage()
            .persistent()
            .set(&StorageKey::Badge(badge_id), &badge);

        // Mark type ownership
        env.storage().persistent().set(&ownership_key, &true);

        // Update user's badge list
        let user_badges_key = StorageKey::UserBadges(recipient.clone());
        let mut user_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_badges_key)
            .unwrap_or(Vec::new(&env));
        user_badges.push_back(badge_id);
        env.storage()
            .persistent()
            .set(&user_badges_key, &user_badges);

        // Emit BadgeAwarded event
        let event_payload = BadgeEvent {
            event_version: 1,
            badge_id,
            badge_type: badge_type.clone() as u32,
            owner: recipient.clone(),
            action: BadgeAction::Grant,
            timestamp: minted_at,
        };
        env.events().publish(
            (Symbol::new(&env, "badge_awarded"), recipient.clone()),
            event_payload,
        );

        Ok(badge_id)
    }

    /// Adjust user reputation (admin only)
    /// This also resets the decay timer for the user
    pub fn adjust_reputation(
        env: Env,
        user: Address,
        amount: i128,
        reason: String,
    ) -> Result<i128, Error> {
        assert_not_paused(&env)?;

        let admin = get_admin(&env)?;
        admin.require_auth();

        // Get current reputation with decay applied
        let current_reputation = get_user_reputation_with_decay(&env, &user);
        let new_reputation = current_reputation + amount;

        // Update reputation and reset timer
        update_reputation_and_reset_timer(&env, &user, new_reputation);

        let event_topic = Symbol::new(&env, "reputation_adjusted");
        env.events().publish(
            (event_topic, user.clone()),
            ReputationAdjustedData {
                user: user.clone(),
                amount,
                reason,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(new_reputation)
    }

    /// Get user reputation with decay applied
    /// This will automatically apply any pending decay before returning
    pub fn get_user_reputation(env: Env, user: Address) -> i128 {
        get_user_reputation_with_decay(&env, &user)
    }

    /// Explicitly apply reputation decay for a user
    /// Can be called by anyone to update a user's reputation (gas-efficient)
    /// Returns the new reputation after decay is applied
    pub fn apply_decay(env: Env, user: Address) -> i128 {
        let current_reputation = env
            .storage()
            .persistent()
            .get(&StorageKey::UserReputation(user.clone()))
            .unwrap_or(0i128);

        let last_update_key = StorageKey::ReputationLastUpdate(user.clone());
        let last_update: u64 = env
            .storage()
            .persistent()
            .get(&last_update_key)
            .unwrap_or(0u64);

        let current_timestamp = env.ledger().timestamp();

        // Calculate epochs elapsed
        let time_elapsed = current_timestamp.saturating_sub(last_update);

        let epochs_elapsed = (time_elapsed / EPOCH_DURATION) as u32;

        if epochs_elapsed == 0 {
            return current_reputation;
        }

        // Calculate decayed reputation
        let new_reputation = calculate_decayed_reputation(current_reputation, epochs_elapsed);

        // Update storage if reputation changed
        if new_reputation != current_reputation {
            env.storage()
                .persistent()
                .set(&StorageKey::UserReputation(user.clone()), &new_reputation);

            // Emit decay event
            let event_topic = Symbol::new(&env, "reputation_decayed");
            env.events().publish(
                (event_topic, user.clone()),
                ReputationDecayedData {
                    user: user.clone(),
                    old_reputation: current_reputation,
                    new_reputation,
                    epochs_applied: epochs_elapsed,
                    timestamp: current_timestamp,
                },
            );
        }

        // Always update the last update timestamp to current time
        env.storage()
            .persistent()
            .set(&last_update_key, &current_timestamp);

        new_reputation
    }

    /// Mint a new badge for a recipient (self-service)
    /// Returns the badge ID if successful
    pub fn mint_badge(env: Env, recipient: Address, badge_type: BadgeType) -> Result<u64, Error> {
        assert_not_paused(&env)?;

        recipient.require_auth();

        // Check if recipient already has this badge type
        let ownership_key = StorageKey::TypeOwnership(recipient.clone(), badge_type.clone());
        if env.storage().persistent().has(&ownership_key) {
            return Err(Error::BadgeAlreadyOwned);
        }

        // Get and increment badge count
        let badge_count = Self::get_badge_count_internal(&env);
        let badge_id = badge_count + 1;
        env.storage()
            .persistent()
            .set(&StorageKey::BadgeCount, &badge_id);

        // Create badge
        let minted_at = env.ledger().timestamp();
        let badge = Badge {
            id: badge_id,
            badge_type: badge_type.clone(),
            minted_at,
            owner: recipient.clone(),
        };

        // Store badge
        env.storage()
            .persistent()
            .set(&StorageKey::Badge(badge_id), &badge);

        // Mark type ownership
        env.storage().persistent().set(&ownership_key, &true);

        // Update user's badge list
        let user_badges_key = StorageKey::UserBadges(recipient.clone());
        let mut user_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_badges_key)
            .unwrap_or(Vec::new(&env));
        user_badges.push_back(badge_id);
        env.storage()
            .persistent()
            .set(&user_badges_key, &user_badges);

        // Emit BadgeGranted event
        let event_payload = BadgeEvent {
            event_version: 1,
            badge_id,
            badge_type: badge_type.clone() as u32,
            owner: recipient.clone(),
            action: BadgeAction::Grant,
            timestamp: minted_at,
        };
        env.events().publish(
            (Symbol::new(&env, "badge_granted"), recipient.clone()),
            event_payload,
        );

        Ok(badge_id)
    }

    /// Get all badges owned by an address
    pub fn get_badges(env: Env, owner: Address) -> Vec<Badge> {
        let user_badges_key = StorageKey::UserBadges(owner);
        let badge_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_badges_key)
            .unwrap_or(Vec::new(&env));

        let mut badges = Vec::new(&env);
        for i in 0..badge_ids.len() {
            if let Some(badge_id) = badge_ids.get(i) {
                if let Some(badge) = env.storage().persistent().get(&StorageKey::Badge(badge_id)) {
                    badges.push_back(badge);
                }
            }
        }
        badges
    }

    /// Check if an owner has a specific badge type
    pub fn has_badge(env: Env, owner: Address, badge_type: BadgeType) -> bool {
        let ownership_key = StorageKey::TypeOwnership(owner, badge_type);
        env.storage().persistent().has(&ownership_key)
    }

    /// Get the total number of badges owned by an address
    pub fn get_badge_count(env: Env, owner: Address) -> u32 {
        let user_badges_key = StorageKey::UserBadges(owner);
        let badge_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_badges_key)
            .unwrap_or(Vec::new(&env));
        badge_ids.len()
    }

    /// Transfer a badge to another address (optional feature)
    pub fn transfer_badge(env: Env, badge_id: u64, to: Address) -> Result<(), Error> {
        assert_not_paused(&env)?;

        // Get the badge
        let badge_key = StorageKey::Badge(badge_id);
        let mut badge: Badge = env
            .storage()
            .persistent()
            .get(&badge_key)
            .ok_or(Error::BadgeNotFound)?;

        // Require auth from current owner
        badge.owner.require_auth();

        let from = badge.owner.clone();

        // Check if recipient already owns this badge type
        let to_ownership_key = StorageKey::TypeOwnership(to.clone(), badge.badge_type.clone());
        if env
            .storage()
            .persistent()
            .get::<StorageKey, bool>(&to_ownership_key)
            .is_some()
        {
            return Err(Error::BadgeTypeAlreadyOwned);
        }

        // Remove from old owner's badge list
        let from_badges_key = StorageKey::UserBadges(from.clone());
        let from_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&from_badges_key)
            .unwrap_or(Vec::new(&env));

        // Filter out the transferred badge
        let mut new_from_badges = Vec::new(&env);
        for i in 0..from_badges.len() {
            if let Some(id) = from_badges.get(i) {
                if id != badge_id {
                    new_from_badges.push_back(id);
                }
            }
        }
        env.storage()
            .persistent()
            .set(&from_badges_key, &new_from_badges);

        // Remove type ownership from old owner
        let from_ownership_key = StorageKey::TypeOwnership(from.clone(), badge.badge_type.clone());
        env.storage().persistent().remove(&from_ownership_key);

        // Add to new owner's badge list
        let to_badges_key = StorageKey::UserBadges(to.clone());
        let mut to_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&to_badges_key)
            .unwrap_or(Vec::new(&env));
        to_badges.push_back(badge_id);
        env.storage().persistent().set(&to_badges_key, &to_badges);

        // Set type ownership for new owner
        env.storage().persistent().set(&to_ownership_key, &true);

        // Update badge owner
        badge.owner = to.clone();
        env.storage().persistent().set(&badge_key, &badge);

        // Emit BadgeTransferred event
        #[allow(deprecated)]
        env.events().publish(
            (Symbol::new(&env, "badge_transferred"), badge_id),
            BadgeTransferredData { badge_id, from, to },
        );

        Ok(())
    }

    /// Get a specific badge by ID
    pub fn get_badge(env: Env, badge_id: u64) -> Option<Badge> {
        env.storage().persistent().get(&StorageKey::Badge(badge_id))
    }

    /// Get total number of badges minted
    pub fn get_total_badges(env: Env) -> u64 {
        Self::get_badge_count_internal(&env)
    }

    /// Get metadata for a badge type.
    ///
    /// Returns the display name, description, and earning criteria for the
    /// requested badge type, or `None` if an admin has not yet defined
    /// metadata via `create_badge`.  Off-chain consumers should call this
    /// instead of reading storage keys directly.
    pub fn get_badge_type_metadata(env: Env, badge_type: BadgeType) -> Option<BadgeTypeMetadata> {
        env.storage()
            .persistent()
            .get(&StorageKey::BadgeTypeMetadata(badge_type))
    }

    /// Check whether metadata has been defined for a badge type.
    ///
    /// Useful for consumers that want to guard against displaying badges
    /// whose metadata has not yet been set up by an admin.
    pub fn has_badge_type_metadata(env: Env, badge_type: BadgeType) -> bool {
        env.storage()
            .persistent()
            .has(&StorageKey::BadgeTypeMetadata(badge_type))
    }

    /// Get a summary of a user's current badge state in a single call.
    ///
    /// Returns `(badge_ids, reputation_score)` so that off-chain consumers
    /// (backend indexers, frontend queries) can fetch the complete badge
    /// picture without issuing multiple separate contract calls.
    pub fn get_user_badge_summary(env: Env, user: Address) -> (Vec<u64>, i128) {
        let user_badges_key = StorageKey::UserBadges(user.clone());
        let badge_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_badges_key)
            .unwrap_or(Vec::new(&env));
        let reputation = Self::get_user_reputation_internal(&env, &user);
        (badge_ids, reputation)
    }

    /// Revoke a badge
    pub fn revoke_badge(env: Env, badge_id: u64) -> Result<(), Error> {
        assert_not_paused(&env)?;

        // Get the badge
        let badge_key = StorageKey::Badge(badge_id);
        let badge: Badge = env
            .storage()
            .persistent()
            .get(&badge_key)
            .ok_or(Error::BadgeNotFound)?;

        let owner = badge.owner.clone();
        let badge_type = badge.badge_type.clone();

        // Require auth from the current owner or admin
        // Since we don't have an admin defined in this contract, let's assume the owner
        // can revoke it or there's some higher level authority. Actually, the contract
        // does not have admin. We will require the owner to authorize revocation.
        owner.require_auth();

        // Remove from owner's badge list
        let user_badges_key = StorageKey::UserBadges(owner.clone());
        let user_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_badges_key)
            .unwrap_or(Vec::new(&env));

        let mut new_user_badges = Vec::new(&env);
        for i in 0..user_badges.len() {
            if let Some(id) = user_badges.get(i) {
                if id != badge_id {
                    new_user_badges.push_back(id);
                }
            }
        }
        env.storage()
            .persistent()
            .set(&user_badges_key, &new_user_badges);

        // Remove type ownership
        let ownership_key = StorageKey::TypeOwnership(owner.clone(), badge_type.clone());
        env.storage().persistent().remove(&ownership_key);

        // Remove badge from storage
        env.storage().persistent().remove(&badge_key);

        // Emit BadgeRevoked event
        let event_payload = BadgeEvent {
            event_version: 1,
            badge_id,
            badge_type: badge_type as u32,
            owner: owner.clone(),
            action: BadgeAction::Revoke,
            timestamp: env.ledger().timestamp(),
        };
        env.events()
            .publish((Symbol::new(&env, "badge_revoked"), owner), event_payload);

        Ok(())
    }

    // Internal helper to get badge count
    fn get_badge_count_internal(env: &Env) -> u64 {
        env.storage()
            .persistent()
            .get(&StorageKey::BadgeCount)
            .unwrap_or(0u64)
    }

    // Internal helper to get user reputation (without decay)
    // This is kept for backward compatibility but new code should use get_user_reputation_with_decay
    fn get_user_reputation_internal(env: &Env, user: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::UserReputation(user.clone()))
            .unwrap_or(0i128)
    }

    /// Global epoch recalibration (admin only)
    /// Applies decay to all active users by incrementing the global epoch
    /// This is a bounded operation - processes a batch of user addresses provided
    /// Returns the number of users whose reputation was updated
    pub fn recalibrate_epoch(env: Env, user_batch: Vec<Address>) -> Result<u32, Error> {
        assert_not_paused(&env)?;

        let admin = get_admin(&env)?;
        admin.require_auth();

        let mut updated_count: u32 = 0;

        for i in 0..user_batch.len() {
            if let Some(user) = user_batch.get(i) {
                let old_rep = env
                    .storage()
                    .persistent()
                    .get(&StorageKey::UserReputation(user.clone()))
                    .unwrap_or(0i128);

                // Apply decay for this user
                let new_rep = apply_reputation_decay(&env, &user);

                if old_rep != new_rep {
                    updated_count += 1;
                }
            }
        }

        // Increment global epoch
        let current_epoch_key = StorageKey::CurrentEpoch;
        let current_epoch: u32 = env
            .storage()
            .persistent()
            .get(&current_epoch_key)
            .unwrap_or(0u32);
        env.storage()
            .persistent()
            .set(&current_epoch_key, &(current_epoch + 1));

        let event_topic = Symbol::new(&env, "epoch_recalibrated");
        env.events()
            .publish((event_topic, admin), (current_epoch + 1, updated_count));

        Ok(updated_count)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Schema migration
    // ─────────────────────────────────────────────────────────────────────

    /// Apply all pending schema migrations and return the new schema version.
    ///
    /// **Idempotent** — safe to call repeatedly; a no-op once storage is at
    /// `SCHEMA_VERSION_CURRENT`. Caller must be the contract admin.
    ///
    /// Schema bumps are purely additive: rollback to a prior WASM build is
    /// safe because it simply ignores the `SchemaVersion` key.
    pub fn migrate(env: Env, caller: Address) -> Result<u32, Error> {
        if !is_authorized(&env, &caller)? {
            return Err(Error::NotAuthorized);
        }
        caller.require_auth();

        let current_version = env
            .storage()
            .persistent()
            .get::<_, u32>(&StorageKey::SchemaVersion)
            .unwrap_or(SCHEMA_VERSION_INITIAL);

        if current_version >= SCHEMA_VERSION_CURRENT {
            return Ok(current_version);
        }

        env.storage()
            .persistent()
            .set(&StorageKey::SchemaVersion, &SCHEMA_VERSION_CURRENT);

        Ok(SCHEMA_VERSION_CURRENT)
    }

    /// Return the current schema version stored on-chain.
    /// Returns `SCHEMA_VERSION_INITIAL` for pre-versioning deployments.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get::<_, u32>(&StorageKey::SchemaVersion)
            .unwrap_or(SCHEMA_VERSION_INITIAL)
    }
}
#[cfg(test)]
mod test;
