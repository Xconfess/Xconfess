use proptest::prelude::*;

#[derive(Debug, Clone)]
pub enum Action {
    Create { actor: u32 },
    React { actor: u32, confession_id: u32 },
    Report { actor: u32, confession_id: u32 },
    Resolve { admin: u32, confession_id: u32 },
}

pub fn action_strategy(max_users: u32, max_confessions: u32)
    -> impl Strategy<Value = Action>
{
    prop_oneof![
        (0..max_users).prop_map(|actor| Action::Create { actor }),
        (0..max_users, 0..max_confessions)
            .prop_map(|(actor, id)| Action::React { actor, confession_id: id }),
        (0..max_users, 0..max_confessions)
            .prop_map(|(actor, id)| Action::Report { actor, confession_id: id }),
        (0..max_users, 0..max_confessions)
            .prop_map(|(admin, id)| Action::Resolve { admin, confession_id: id }),
    ]
}