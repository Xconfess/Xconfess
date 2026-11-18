use soroban_sdk::{Env, String};

use crate::emergency_pause::{
    admin::require_pause_authority,
    errors::PauseError,
    events,
    events::{emit_paused, emit_unpaused},
    storage::DataKey,
};

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

pub fn assert_not_paused(env: &Env) -> Result<(), PauseError> {
    if is_paused(env) {
        return Err(PauseError::ContractPaused);
    }
    Ok(())
}

pub fn pause(env: Env, caller: soroban_sdk::Address, reason: String) -> Result<(), PauseError> {
    let actor = require_pause_authority(&env, &caller)?;

    if is_paused(&env) {
        return Err(PauseError::AlreadyPaused);
    }

    // Validate before mutating state; although a returned Err rolls the whole
    // invocation back on-chain, failing early keeps the invariant explicit.
    events::validate_pause_reason(&reason)?;

    env.storage().instance().set(&DataKey::Paused, &true);

    emit_paused(&env, &actor, reason)?;

    Ok(())
}

pub fn unpause(env: Env, caller: soroban_sdk::Address, reason: String) -> Result<(), PauseError> {
    let actor = require_pause_authority(&env, &caller)?;

    if !is_paused(&env) {
        return Err(PauseError::NotPaused);
    }

    events::validate_pause_reason(&reason)?;

    env.storage().instance().set(&DataKey::Paused, &false);

    emit_unpaused(&env, &actor, reason)?;

    Ok(())
}

/// Internal: Set paused state without admin authorization check.
/// Used by governance module after quorum approval.
pub fn set_paused_internal(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}
