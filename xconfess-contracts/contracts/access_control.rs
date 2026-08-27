//! Access-control module for the XConfess Soroban contract.
//!
//! File: xconfess-contract/src/access_control.rs
//!
//! # Role model
//!
//! ```text
//!  OWNER  ──▶ assign_admin / revoke_admin / transfer_ownership / update_config
//!   │
//!   └──▶ ADMIN  ──▶ resolve
//! ```
//!
//! One owner exists at all times (set during `initialize`).
//! Any number of admins may be active simultaneously.
//! Owner is implicitly an admin for every privileged function.
//!
//! # Storage layout
//!
//! | Key symbol  | Type              | Description                        |
//! |-------------|-------------------|------------------------------------|
//! | `OWNER`     | `Address`         | Single contract owner               |
//! | `ADMINS`    | `Map<Address,()>` | Set of granted admin addresses      |
//!
//! Using `Map<Address, ()>` rather than `Vec<Address>` gives O(1) membership
//! checks and clean revocation without index shifting.
//!
//! # Events
//!
//! Every role mutation emits a ledger event so off-chain indexers and the
//! NestJS `AuditLogService` (via Stellar horizon) can track role history.
//!
//! | Topic symbol        | Data                          |
//! |---------------------|-------------------------------|
//! | `admin_granted`     | `{ address: Address }`        |
//! | `admin_revoked`     | `{ address: Address }`        |
//! | `ownership_xfer`    | `{ from: Address, to: Address }` |

use soroban_sdk::{contractevent, contracttype, Address, Env, Map, String};

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────

/// Typed storage key enum — lets the compiler catch key typos.
#[contracttype]
#[derive(Clone)]
pub enum AccessKey {
    Owner,
    Admins,
    Operators,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Owner,
    Admin,
    Operator,
}

// ─────────────────────────────────────────────────────────────────────────────
// Error codes
// ─────────────────────────────────────────────────────────────────────────────

/// Contract-level error codes returned on privileged-action failures.
///
/// Using explicit `u32` discriminants lets the NestJS backend and frontend
/// match on stable numeric codes without parsing message strings.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum AccessError {
    /// Caller is not the owner (code 1).
    NotOwner = 1,
    /// Caller is neither owner nor admin (code 2).
    NotAuthorized = 2,
    /// Target address is already an admin (code 3).
    AlreadyAdmin = 3,
    /// Target address is not an admin (cannot revoke) (code 4).
    NotAdmin = 4,
    /// Contract has not been initialized yet (code 5).
    NotInitialized = 5,
    /// Owner cannot remove their own admin rights (code 6).
    CannotDemoteOwner = 6,
    /// Cannot revoke last admin - would leave contract without authorized admin (code 7).
    CannotRevokeLastAdmin = 7,
    /// Cannot transfer ownership to same address (code 8).
    InvalidOwnershipTransfer = 8,
    /// Target address is already an operator (code 9).
    AlreadyOperator = 9,
    /// Target address is not an operator (cannot revoke) (code 10).
    NotOperator = 10,
}

#[contractevent(topics = ["adm_grant"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
struct AdminGrantedEvent {
    #[topic]
    address: Address,
}

#[contractevent(topics = ["adm_revke"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
struct AdminRevokedEvent {
    #[topic]
    address: Address,
}

#[contractevent(topics = ["own_xfer"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
struct OwnershipTransferredEvent {
    #[topic]
    new_owner: Address,
    previous_owner: Address,
}

#[contractevent(topics = ["gov_inv"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
struct GovernanceInvariantEvent {
    operation: String,
    reason: String,
    caller: Address,
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/// Set the initial owner. Must be called exactly once (from `initialize`).
/// Panics if an owner is already recorded — prevents re-initialization attacks.
/// Refactored
pub fn init_owner(env: &Env, owner: &Address) -> Result<(), AccessError> {
    if env.storage().instance().has(&AccessKey::Owner) {
        return Err(AccessError::NotInitialized); // or introduce AlreadyInitialized
    }

    env.storage().instance().set(&AccessKey::Owner, owner);

    let admins: Map<Address, ()> = Map::new(env);
    env.storage().instance().set(&AccessKey::Admins, &admins);

    let operators: Map<Address, ()> = Map::new(env);
    env.storage()
        .instance()
        .set(&AccessKey::Operators, &operators);

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Role reads (pure — no auth required)
// ─────────────────────────────────────────────────────────────────────────────

/// Returns the current owner address.
/// Panics with `AccessError::NotInitialized` if `init_owner` was never called.
pub fn get_owner(env: &Env) -> Result<Address, AccessError> {
    env.storage()
        .instance()
        .get(&AccessKey::Owner)
        .ok_or(AccessError::NotInitialized)
}

/// Returns `true` if `addr` is the current owner.
pub fn is_owner(env: &Env, addr: &Address) -> Result<bool, AccessError> {
    Ok(get_owner(env)? == *addr)
}

/// Returns `true` if `addr` is in the admin set (owner is NOT implicitly
/// listed here; use `is_authorized` for the combined check).
pub fn is_admin(env: &Env, addr: &Address) -> bool {
    let admins: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Admins)
        .unwrap_or_else(|| Map::new(env));
    admins.contains_key(addr.clone())
}

/// Returns `true` if `addr` is in the operator set.
pub fn is_operator(env: &Env, addr: &Address) -> bool {
    let operators: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Operators)
        .unwrap_or_else(|| Map::new(env));
    operators.contains_key(addr.clone())
}

/// Return true when `addr` has the requested role.
pub fn has_role(env: &Env, addr: &Address, role: Role) -> Result<bool, AccessError> {
    match role {
        Role::Owner => is_owner(env, addr),
        Role::Admin => Ok(is_admin(env, addr)),
        Role::Operator => Ok(is_operator(env, addr)),
    }
}

/// Returns `true` if `addr` is the owner OR is an explicit admin.
/// Use this as the guard predicate for moderation-level actions (e.g. `resolve`).
pub fn is_authorized(env: &Env, addr: &Address) -> Result<bool, AccessError> {
    is_owner(env, addr).map(|owner| owner || is_admin(env, addr))
}

/// Returns the total number of active admins (excluding the owner).
/// The owner is implicitly authorized but not counted in the admin set.
pub fn count_admins(env: &Env) -> u32 {
    let admins: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Admins)
        .unwrap_or_else(|| Map::new(env));
    admins.len()
}

/// Returns the total number of active operators.
pub fn count_operators(env: &Env) -> u32 {
    let operators: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Operators)
        .unwrap_or_else(|| Map::new(env));
    operators.len()
}

/// Returns the total number of authorized addresses (owner + admins).
/// This is used to ensure we never have zero authorized addresses.
pub fn count_authorized(env: &Env) -> u32 {
    // Owner is always authorized (1) + number of explicit admins
    1 + count_admins(env)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth guards (call at the top of privileged entry points)
// ─────────────────────────────────────────────────────────────────────────────

/// Require that `caller` is the owner and has signed the invocation.
/// Panics with `AccessError::NotOwner` otherwise.
pub fn require_owner(env: &Env, caller: &Address) -> Result<(), AccessError> {
    caller.require_auth();

    let owner = get_owner(env)?;
    if owner != *caller {
        return Err(AccessError::NotOwner);
    }

    Ok(())
}

/// Require that `caller` is the owner OR an admin and has signed.
/// Panics with `AccessError::NotAuthorized` otherwise.
pub fn require_admin_or_owner(env: &Env, caller: &Address) -> Result<(), AccessError> {
    caller.require_auth();

    if !is_authorized(env, caller)? {
        return Err(AccessError::NotAuthorized);
    }

    Ok(())
}

/// Require owner OR admin OR operator role for operational routines.
pub fn require_operator_or_admin_or_owner(env: &Env, caller: &Address) -> Result<(), AccessError> {
    caller.require_auth();

    if is_owner(env, caller)? || is_admin(env, caller) || is_operator(env, caller) {
        return Ok(());
    }

    Err(AccessError::NotAuthorized)
}

// ─────────────────────────────────────────────────────────────────────────────
// Role mutations (owner-only)
// ─────────────────────────────────────────────────────────────────────────────

/// Grant `target` the admin role.
///
/// * Caller must be the owner.
/// * Panics with `AccessError::AlreadyAdmin` if `target` is already an admin.
/// * Emits `admin_granted` event.
pub fn grant_admin(env: &Env, caller: &Address, target: &Address) -> Result<(), AccessError> {
    require_owner(env, caller)?;
    internal_grant_admin(env, target)
}

pub fn internal_grant_admin(env: &Env, target: &Address) -> Result<(), AccessError> {
    if is_admin(env, target) {
        return Err(AccessError::AlreadyAdmin);
    }

    let mut admins: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Admins)
        .unwrap_or_else(|| Map::new(env));

    admins.set(target.clone(), ());
    env.storage().instance().set(&AccessKey::Admins, &admins);

    AdminGrantedEvent {
        address: target.clone(),
    }
    .publish(env);

    Ok(())
}

/// Revoke `target`'s admin role.
///
/// * Caller must be the owner.
/// * Panics with `AccessError::NotAdmin` if `target` is not currently an admin.
/// * Panics with `AccessError::CannotDemoteOwner` if `target` is the owner
///   (the owner is always implicitly authorized; removing them from the admin
///   map would create misleading authorization state).
/// * Panics with `AccessError::CannotRevokeLastAdmin` if revoking would leave
///   the contract with zero authorized addresses.
/// * Emits `admin_revoked` event.
pub fn revoke_admin(env: &Env, caller: &Address, target: &Address) -> Result<(), AccessError> {
    require_owner(env, caller)?;
    internal_revoke_admin(env, target, caller)
}

pub fn internal_revoke_admin(
    env: &Env,
    target: &Address,
    caller: &Address,
) -> Result<(), AccessError> {
    if is_owner(env, target)? {
        return Err(AccessError::CannotDemoteOwner);
    }

    if !is_admin(env, target) {
        return Err(AccessError::NotAdmin);
    }

    let current_admins = count_admins(env);
    if current_admins <= 1 {
        GovernanceInvariantEvent {
            operation: String::from_str(env, "revoke_admin"),
            reason: String::from_str(env, "Cannot revoke last admin"),
            caller: caller.clone(),
        }
        .publish(env);
        return Err(AccessError::CannotRevokeLastAdmin);
    }

    let mut admins: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Admins)
        .unwrap_or_else(|| Map::new(env));

    admins.remove(target.clone());
    env.storage().instance().set(&AccessKey::Admins, &admins);

    AdminRevokedEvent {
        address: target.clone(),
    }
    .publish(env);

    Ok(())
}

/// Transfer contract ownership to `new_owner`.
///
/// * Caller must be the current owner.
/// * Panics with `AccessError::InvalidOwnershipTransfer` if transferring to same address.
/// * The old owner loses owner status (but retains any explicit admin entry
///   if one was previously granted — revoke separately if desired).
/// * `new_owner` is NOT automatically added to the admin set; they are the
///   owner, which is a superset of admin.
/// * Emits `own_xfer` event carrying both old and new addresses.
pub fn transfer_ownership(
    env: &Env,
    caller: &Address,
    new_owner: &Address,
) -> Result<(), AccessError> {
    require_owner(env, caller)?;
    internal_transfer_ownership(env, new_owner)
}

pub fn internal_transfer_ownership(env: &Env, new_owner: &Address) -> Result<(), AccessError> {
    let old_owner = get_owner(env)?;

    if old_owner == *new_owner {
        return Err(AccessError::InvalidOwnershipTransfer);
    }

    env.storage().instance().set(&AccessKey::Owner, new_owner);

    OwnershipTransferredEvent {
        new_owner: new_owner.clone(),
        previous_owner: old_owner,
    }
    .publish(env);

    Ok(())
}

/// Grant `target` the operator role.
/// Caller must be owner or admin.
pub fn grant_operator(env: &Env, caller: &Address, target: &Address) -> Result<(), AccessError> {
    require_admin_or_owner(env, caller)?;

    if is_operator(env, target) {
        return Err(AccessError::AlreadyOperator);
    }

    let mut operators: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Operators)
        .unwrap_or_else(|| Map::new(env));

    operators.set(target.clone(), ());
    env.storage()
        .instance()
        .set(&AccessKey::Operators, &operators);

    Ok(())
}

/// Revoke `target`'s operator role.
/// Caller must be owner or admin.
pub fn revoke_operator(env: &Env, caller: &Address, target: &Address) -> Result<(), AccessError> {
    require_admin_or_owner(env, caller)?;

    if !is_operator(env, target) {
        return Err(AccessError::NotOperator);
    }

    let mut operators: Map<Address, ()> = env
        .storage()
        .instance()
        .get(&AccessKey::Operators)
        .unwrap_or_else(|| Map::new(env));

    operators.remove(target.clone());
    env.storage()
        .instance()
        .set(&AccessKey::Operators, &operators);

    Ok(())
}
