use soroban_sdk::{Address, Env};

use crate::emergency_pause::errors::PauseError;
use crate::emergency_pause::storage::DataKey;

/// Deprecated storage-backed admin setter.
///
/// NOTE: Newer flows should authorize pause/unpause via `access_control`
/// (owner/admin) to avoid lockout if a dedicated pause admin key is lost.
pub fn set_admin(env: &Env, admin: Address) {
    admin.require_auth();

    env.storage().instance().set(&DataKey::Admin, &admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("Admin not set")
}

/// Require an authorized actor for emergency pause actions.
///
/// This intentionally shares the same authorization surface as the rest of the
/// contract (owner OR admin) so emergency pause cannot be stranded behind a
/// separate, drift-prone "pause admin" key.
pub fn require_pause_authority(env: &Env, caller: &Address) -> Result<Address, PauseError> {
    crate::access_control::require_admin_or_owner(env, caller)
        .map_err(|_| PauseError::Unauthorized)?;
    Ok(caller.clone())
}
