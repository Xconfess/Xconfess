use std::collections::BTreeSet;

use super::actions::{Action, Outcome};
use super::reference::{ConfessionState, ModelState};

// This "observed" machine is intentionally separate from the reference model.
// In a fully wired setup, this would execute contract calls and decode state/events.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObservedMachine {
    state: ModelState,
}

impl ObservedMachine {
    pub fn new() -> Self {
        Self {
            state: ModelState::new(),
        }
    }

    pub fn snapshot(&self) -> &ModelState {
        &self.state
    }

    pub fn apply(&mut self, action: &Action) -> Outcome {
        match *action {
            Action::Create { .. } => {
                let id = self.state.next_id;
                self.state.next_id = self.state.next_id.saturating_add(1);
                self.state.confessions.insert(
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
            } => self.apply_react(actor, confession_id),
            Action::Report {
                actor,
                confession_id,
                reason_len,
            } => self.apply_report(actor, confession_id, reason_len),
            Action::Resolve {
                admin,
                confession_id,
            } => self.apply_resolve(admin, confession_id),
            Action::Escalate {
                admin,
                confession_id,
            } => self.apply_escalate(admin, confession_id),
        }
    }

    fn apply_react(&mut self, actor: u32, confession_id: u32) -> Outcome {
        let Some(conf) = self.state.confessions.get_mut(&confession_id) else {
            return Outcome::Rejected("confession_not_found");
        };
        if conf.resolved {
            return Outcome::Rejected("already_resolved");
        }
        if conf.escalated {
            return Outcome::Rejected("escalated_terminal");
        }
        if conf.reacted_by.contains(&actor) {
            return Outcome::Rejected("duplicate_reaction");
        }
        conf.reacted_by.insert(actor);
        Outcome::Applied
    }

    fn apply_report(&mut self, actor: u32, confession_id: u32, reason_len: u32) -> Outcome {
        let Some(conf) = self.state.confessions.get_mut(&confession_id) else {
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
        if conf.reported_by.contains(&actor) {
            return Outcome::Rejected("duplicate_report");
        }
        conf.reported_by.insert(actor);
        Outcome::Applied
    }

    fn apply_resolve(&mut self, admin: u32, confession_id: u32) -> Outcome {
        if !self.state.admins.contains(&admin) {
            return Outcome::Rejected("unauthorized");
        }
        let Some(conf) = self.state.confessions.get_mut(&confession_id) else {
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

    fn apply_escalate(&mut self, admin: u32, confession_id: u32) -> Outcome {
        if !self.state.admins.contains(&admin) {
            return Outcome::Rejected("unauthorized");
        }
        let Some(conf) = self.state.confessions.get_mut(&confession_id) else {
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
