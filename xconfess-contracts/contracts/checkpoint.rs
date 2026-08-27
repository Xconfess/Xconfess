use soroban_sdk::{contracttype, Env, Vec};
use crate::confession::Confession;
use crate::reaction::Reaction;
use crate::report::Report;

/// Snapshot summaries for indexer consumption
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointSummary {
    pub total_confessions: u64,
    pub total_reactions: u64,
    pub total_reports: u64,
    pub latest_confession_id: u64,
    pub latest_reaction_id: u64,
    pub latest_report_id: u64,
    pub version_marker: u32, // allows backward-compatible upgrades
}

/// Snapshot page for paginated reading
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotPage<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<u64>, // next starting id for pagination
}

/// ===========================================
/// API: deterministic checkpoint reads
/// ===========================================
pub fn get_checkpoint_summary(
    env: &Env,
    confessions: &Vec<Confession>,
    reactions: &Vec<Reaction>,
    reports: &Vec<Report>,
) -> CheckpointSummary {
    let total_confessions = confessions.len() as u64;
    let total_reactions = reactions.len() as u64;
    let total_reports = reports.len() as u64;

    let latest_confession_id = confessions.last().map(|c| c.id).unwrap_or(0);
    let latest_reaction_id = reactions.last().map(|r| r.id).unwrap_or(0);
    let latest_report_id = reports.last().map(|rep| rep.id).unwrap_or(0);

    CheckpointSummary {
        total_confessions,
        total_reactions,
        total_reports,
        latest_confession_id,
        latest_reaction_id,
        latest_report_id,
        version_marker: 1,
    }
}

/// ===========================================
/// API: deterministic paginated snapshot reads
/// ===========================================
pub fn get_snapshot_page<T: Clone>(
    items: &Vec<T>,
    start_id: u64,
    page_size: u64,
    get_id: impl Fn(&T) -> u64,
) -> SnapshotPage<T> {
    let mut page_items = Vec::new(items.env());
    let mut next_cursor: Option<u64> = None;

    for item in items.iter() {
        let id = get_id(&item);
        if id > start_id && page_items.len() < page_size as usize {
            page_items.push(item.clone());
        } else if id > start_id {
            next_cursor = Some(id);
            break;
        }
    }

    SnapshotPage {
        items: page_items,
        next_cursor,
    }
}