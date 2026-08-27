use soroban_sdk::{contracttype, Address, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CriticalAction {
    GrantAdmin(Address),
    RevokeAdmin(Address),
    TransferOwnership(Address),
    Pause,
    Unpause,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub action: CriticalAction,
    pub proposer: Address,
    pub approvers: Vec<Address>,
    pub created_at: u64,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    pub quorum_threshold: u32,
}
