use crate::events::next_governance_nonce;
use soroban_sdk::{contractevent, Address, Env, String as SorobanString};

// #403: bound governance free-form metadata to keep event payloads predictable.
pub const MAX_GOV_TEXT_LEN: usize = 128;

#[contractevent(topics = ["gov_prop"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceProposedEvent {
    #[topic]
    pub proposal_id: u64,
    pub proposer: Address,
}

#[contractevent(topics = ["gov_app"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceApprovedEvent {
    #[topic]
    pub proposal_id: u64,
    pub approver: Address,
}

#[contractevent(topics = ["gov_rev"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceApprovalRevokedEvent {
    #[topic]
    pub proposal_id: u64,
    pub actor: Address,
}

#[contractevent(topics = ["gov_exec"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceExecutedEvent {
    #[topic]
    pub proposal_id: u64,
    pub executor: Address,
}

#[contractevent(topics = ["adm_prop"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceProposedAdminEvent {
    pub current: Address,
    pub proposed: Address,
}

#[contractevent(topics = ["adm_acc"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceAcceptedAdminEvent {
    pub old: Address,
    pub new_admin: Address,
}

#[contractevent(topics = ["adm_can"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceCancelledAdminEvent {
    pub admin: Address,
}

#[contractevent(topics = ["gov_inv"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovInvariantViolationEvent {
    pub nonce: u64,
    pub timestamp: u64,
    pub operation: SorobanString,
    pub reason: SorobanString,
    pub attempted_by: Address,
}

pub fn action_proposed(e: &Env, proposal_id: u64, proposer: Address) {
    GovernanceProposedEvent {
        proposal_id,
        proposer,
    }
    .publish(e);
}

pub fn action_approved(e: &Env, proposal_id: u64, approver: Address) {
    GovernanceApprovedEvent {
        proposal_id,
        approver,
    }
    .publish(e);
}

pub fn approval_revoked(e: &Env, proposal_id: u64, actor: Address) {
    GovernanceApprovalRevokedEvent { proposal_id, actor }.publish(e);
}

pub fn action_executed(e: &Env, proposal_id: u64, executor: Address) {
    GovernanceExecutedEvent {
        proposal_id,
        executor,
    }
    .publish(e);
}

pub fn proposed(e: &Env, current: Address, proposed: Address) {
    GovernanceProposedAdminEvent { current, proposed }.publish(e);
}

pub fn accepted(e: &Env, old: Address, new_admin: Address) {
    GovernanceAcceptedAdminEvent { old, new_admin }.publish(e);
}

pub fn cancelled(e: &Env, admin: Address) {
    GovernanceCancelledAdminEvent { admin }.publish(e);
}

pub fn invariant_violation(e: &Env, operation: &str, reason: &str, attempted_by: Address) {
    if operation.len() > MAX_GOV_TEXT_LEN {
        panic!("governance operation metadata too long");
    }
    if reason.len() > MAX_GOV_TEXT_LEN {
        panic!("governance reason metadata too long");
    }

    let payload = GovInvariantViolationEvent {
        nonce: next_governance_nonce(e, soroban_sdk::symbol_short!("gov_inv")),
        timestamp: e.ledger().timestamp(),
        operation: SorobanString::from_str(e, operation),
        reason: SorobanString::from_str(e, reason),
        attempted_by,
    };
    payload.publish(e);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::latest_governance_nonce;
    use soroban_sdk::{contract, testutils::Address as _};

    #[contract]
    struct TestHost;

    #[test]
    fn governance_metadata_exact_limit_succeeds() {
        let env = Env::default();
        let contract_id = env.register(TestHost, ());
        let actor = Address::generate(&env);
        let op = "o".repeat(MAX_GOV_TEXT_LEN);
        let reason = "r".repeat(MAX_GOV_TEXT_LEN);

        env.as_contract(&contract_id, || {
            invariant_violation(&env, &op, &reason, actor);
            assert_eq!(
                latest_governance_nonce(&env, soroban_sdk::symbol_short!("gov_inv")),
                1
            );
        });
    }

    #[test]
    #[should_panic(expected = "governance reason metadata too long")]
    fn governance_metadata_limit_plus_one_rejected() {
        let env = Env::default();
        let contract_id = env.register(TestHost, ());
        let actor = Address::generate(&env);
        let op = "o".repeat(MAX_GOV_TEXT_LEN);
        let reason = "r".repeat(MAX_GOV_TEXT_LEN + 1);

        env.as_contract(&contract_id, || {
            invariant_violation(&env, &op, &reason, actor);
        });
    }
}
