use soroban_sdk::{contracterror, contracttype, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Report {
    pub id: u64,
    pub created_seq: u64,
    pub confession_id: u64,
}

#[contracttype]
pub enum ReportKey {
    Counter,
    Registry(u64),
}

/// Deterministic page of reports, ordered by ascending report `id`
/// (creation order). Mirrors `confession_registry::Page` so callers get the
/// same cursor semantics across both entities.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReportPage {
    pub items: Vec<Report>,
    pub has_next_page: bool,
    pub next_cursor: Option<u64>,
}

/// Typed pagination errors surfaced to callers instead of panics.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PaginationError {
    /// `limit` must be at least 1.
    LimitZero = 1,
}

const MAX_LIMIT: u64 = 50;

pub fn create(env: &Env, confession_id: u64) -> u64 {
    let mut id: u64 = env
        .storage()
        .instance()
        .get(&ReportKey::Counter)
        .unwrap_or(0);

    id += 1;
    let created_seq = env.ledger().sequence().into();

    let report = Report {
        id,
        created_seq,
        confession_id,
    };

    env.storage()
        .instance()
        .set(&ReportKey::Registry(id), &report);

    env.storage().instance().set(&ReportKey::Counter, &id);

    id
}

/// List reports with cursor-based pagination, ordered by ascending `id`
/// (i.e. creation order — the only ordering that stays stable when reports
/// are inserted concurrently with a caller paging through results).
///
/// - `cursor`: exclusive lower bound (last seen report id). `None` starts
///   from the beginning.
/// - `limit`: maximum number of items to return (capped at 50, must be > 0).
pub fn list(env: &Env, cursor: Option<u64>, limit: u32) -> Result<ReportPage, PaginationError> {
    if limit == 0 {
        return Err(PaginationError::LimitZero);
    }
    let limit = (limit as u64).min(MAX_LIMIT);

    let start = cursor.unwrap_or(0) + 1;
    let total: u64 = env
        .storage()
        .instance()
        .get(&ReportKey::Counter)
        .unwrap_or(0);

    let mut items: Vec<Report> = Vec::new(env);
    let mut id = start;
    // Fetch up to limit+1 to detect whether a next page exists.
    while id <= total && items.len() as u64 <= limit {
        if let Some(r) = env
            .storage()
            .instance()
            .get::<ReportKey, Report>(&ReportKey::Registry(id))
        {
            items.push_back(r);
        }
        id += 1;
    }

    let has_next_page = items.len() as u64 > limit;
    if has_next_page {
        items.pop_back();
    }

    let next_cursor = if has_next_page {
        items.last().map(|r| r.id)
    } else {
        None
    };

    Ok(ReportPage {
        items,
        has_next_page,
        next_cursor,
    })
}
