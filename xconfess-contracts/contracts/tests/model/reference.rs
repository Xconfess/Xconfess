use std::collections::{BTreeMap, BTreeSet};

use super::actions::{Action, Outcome};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionState {
    pub id: u32,
    pub reacted_by: BTreeSet<u32>,
    pub reported_by: BTreeSet<u32>,
    pub resolved: bool,
    pub escalated: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelState {
    pub next_id: u32,
    pub confessions: BTreeMap<u32, ConfessionState>,
    pub admins: BTreeSet<u32>,
}

impl ModelState {
    pub fn new() -> Self {
        let mut admins = BTreeSet::new();
        admins.insert(0); // deterministic default owner/admin
        Self {
            next_id: 1,
            confessions: BTreeMap::new(),
            admins,
        }
    }

    pub fn apply(&mut self, action: &Action) -> Outcome {
        match *action {
            Action::Create { .. } => {
                let id = self.next_id;
                self.next_id = self.next_id.saturating_add(1);
                self.confessions.insert(
                    id,
                    ConfessionState {
                        id,
                        reacted_by: BTreeSet::new(),
                        reported_by: BTreeSet::new(),
                        resolved: false,
                        escalated: false,
                    },
                );
                Outcome::Applied
            }
            Action::React {
                actor,
                confession_id,
            } => {
                let Some(conf) = self.confessions.get_mut(&confession_id) else {
                    return Outcome::Rejected("confession_not_found");
                };
                if conf.resolved {
                    return Outcome::Rejected("already_resolved");
                }
                if conf.escalated {
                    return Outcome::Rejected("escalated_terminal");
                }
                if !conf.reacted_by.insert(actor) {
                    return Outcome::Rejected("duplicate_reaction");
                }
                Outcome::Applied
            }
            Action::Report {
                actor,
                confession_id,
                reason_len,
            } => {
                let Some(conf) = self.confessions.get_mut(&confession_id) else {
                    return Outcome::Rejected("confession_not_found");
                };
                if conf.resolved {
                    return Outcome::Rejected("already_resolved");
                }
                if conf.escalated {
                    return Outcome::Rejected("escalated_terminal");
                }
                if reason_len == 0 {
                    return Outcome::Rejected("reason_empty");
                }
                if reason_len > 128 {
                    return Outcome::Rejected("reason_too_long");
                }
                if !conf.reported_by.insert(actor) {
                    return Outcome::Rejected("duplicate_report");
                }
                Outcome::Applied
            }
            Action::Resolve {
                admin,
                confession_id,
            } => {
                if !self.admins.contains(&admin) {
                    return Outcome::Rejected("unauthorized");
                }
                let Some(conf) = self.confessions.get_mut(&confession_id) else {
                    return Outcome::Rejected("confession_not_found");
                };
                if conf.resolved {
                    return Outcome::Rejected("already_resolved");
                }
                if conf.escalated {
                    return Outcome::Rejected("must_resolve_from_escalated");
                }
                if conf.reported_by.is_empty() {
                    return Outcome::Rejected("no_pending_report");
                }
                conf.resolved = true;
                Outcome::Applied
            }
            Action::Escalate {
                admin,
                confession_id,
            } => {
                if !self.admins.contains(&admin) {
                    return Outcome::Rejected("unauthorized");
                }
                let Some(conf) = self.confessions.get_mut(&confession_id) else {
                    return Outcome::Rejected("confession_not_found");
                };
                if conf.resolved {
                    return Outcome::Rejected("cannot_escalate_resolved");
                }
                if conf.escalated {
                    return Outcome::Rejected("already_escalated");
                }
                if conf.reported_by.is_empty() {
                    return Outcome::Rejected("no_pending_report_to_escalate");
                }
                conf.escalated = true;
                Outcome::Applied
            }
        }
    }
}
