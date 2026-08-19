#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    Create {
        actor: u32,
    },
    React {
        actor: u32,
        confession_id: u32,
    },
    Report {
        actor: u32,
        confession_id: u32,
        reason_len: u32,
    },
    Resolve {
        admin: u32,
        confession_id: u32,
    },
    Escalate {
        admin: u32,
        confession_id: u32,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Outcome {
    Applied,
    Rejected(&'static str),
}
