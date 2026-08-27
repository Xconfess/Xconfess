use soroban_sdk::{Address, Env, Vec};

use super::events::*;
use super::model::{CriticalAction, GovernanceConfig, Proposal};
use super::storage::DataKey;
use crate::access_control::{is_authorized, require_owner};
use crate::emergency_pause;
use crate::error::ContractError;

pub fn get_config(e: &Env) -> GovernanceConfig {
    e.storage()
        .instance()
        .get(&DataKey::GovernanceConfig)
        .unwrap_or(GovernanceConfig {
            quorum_threshold: 1,
        })
}

pub fn set_config(e: &Env, caller: &Address, config: GovernanceConfig) {
    require_owner(e, caller).unwrap_or_else(|_| panic!("{}", ContractError::Unauthorized as u32));
    e.storage()
        .instance()
        .set(&DataKey::GovernanceConfig, &config);
}

pub fn get_next_proposal_id(e: &Env) -> u64 {
    e.storage()
        .instance()
        .get(&DataKey::NextProposalId)
        .unwrap_or(1)
}

pub fn increment_proposal_id(e: &Env) {
    let id = get_next_proposal_id(e);
    e.storage()
        .instance()
        .set(&DataKey::NextProposalId, &(id + 1));
}

pub fn propose(e: &Env, proposer: Address, action: CriticalAction) -> u64 {
    proposer.require_auth();
    if !is_authorized(e, &proposer).unwrap_or(false) {
        panic!("{}", ContractError::Unauthorized as u32);
    }

    let id = get_next_proposal_id(e);
    increment_proposal_id(e);

    let proposal = Proposal {
        id,
        action,
        proposer: proposer.clone(),
        approvers: Vec::new(e),
        created_at: e.ledger().timestamp(),
        executed: false,
    };

    e.storage()
        .instance()
        .set(&DataKey::Proposal(id), &proposal);
    action_proposed(e, id, proposer);
    id
}

pub fn approve(e: &Env, approver: Address, id: u64) {
    approver.require_auth();
    if !is_authorized(e, &approver).unwrap_or(false) {
        panic!("{}", ContractError::UnauthorizedApproval as u32);
    }

    let mut proposal: Proposal = e
        .storage()
        .instance()
        .get(&DataKey::Proposal(id))
        .expect("proposal not found");

    if proposal.executed {
        panic!("{}", ContractError::AlreadyExecuted as u32);
    }

    if proposal.approvers.contains(approver.clone()) {
        panic!("{}", ContractError::AlreadyApproved as u32);
    }

    proposal.approvers.push_back(approver.clone());
    e.storage()
        .instance()
        .set(&DataKey::Proposal(id), &proposal);
    action_approved(e, id, approver);
}

pub fn revoke(e: &Env, actor: Address, id: u64) {
    actor.require_auth();

    let mut proposal: Proposal = e
        .storage()
        .instance()
        .get(&DataKey::Proposal(id))
        .expect("proposal not found");

    if proposal.executed {
        panic!("{}", ContractError::AlreadyExecuted as u32);
    }

    let mut found = false;
    let mut new_approvers = Vec::new(e);
    for app in proposal.approvers.iter() {
        if app == actor {
            found = true;
        } else {
            new_approvers.push_back(app);
        }
    }

    if !found {
        panic!("{}", ContractError::NotFound as u32);
    }

    proposal.approvers = new_approvers;
    e.storage()
        .instance()
        .set(&DataKey::Proposal(id), &proposal);
    approval_revoked(e, id, actor);
}

pub fn execute(e: &Env, executor: Address, id: u64) {
    executor.require_auth();
    if !is_authorized(e, &executor).unwrap_or(false) {
        panic!("{}", ContractError::Unauthorized as u32);
    }

    let mut proposal: Proposal = e
        .storage()
        .instance()
        .get(&DataKey::Proposal(id))
        .expect("proposal not found");

    if proposal.executed {
        panic!("{}", ContractError::AlreadyExecuted as u32);
    }

    let config = get_config(e);
    if proposal.approvers.len() < config.quorum_threshold {
        panic!("{}", ContractError::QuorumNotReached as u32);
    }

    // execute the action
    match proposal.action.clone() {
        CriticalAction::GrantAdmin(target) => {
            crate::access_control::internal_grant_admin(e, &target)
                .unwrap_or_else(|err| panic!("{}", err as u32));
        }
        CriticalAction::RevokeAdmin(target) => {
            crate::access_control::internal_revoke_admin(e, &target, &proposal.proposer)
                .unwrap_or_else(|err| panic!("{}", err as u32));
        }
        CriticalAction::TransferOwnership(target) => {
            crate::access_control::internal_transfer_ownership(e, &target)
                .unwrap_or_else(|err| panic!("{}", err as u32));
        }
        CriticalAction::Pause => {
            emergency_pause::set_paused_internal(e, true);
        }
        CriticalAction::Unpause => {
            emergency_pause::set_paused_internal(e, false);
        }
    }

    proposal.executed = true;
    e.storage()
        .instance()
        .set(&DataKey::Proposal(id), &proposal);
    action_executed(e, id, executor);
}
