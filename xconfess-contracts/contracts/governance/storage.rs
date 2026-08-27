use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    GovernanceConfig,
    Proposal(u64),
    NextProposalId,
}
