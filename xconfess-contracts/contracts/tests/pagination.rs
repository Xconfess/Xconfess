#![cfg(test)]

extern crate std;

use confession_registry::report_pagination::{self, PaginationError};
use confession_registry::{ConfessionRegistry, ConfessionRegistryClient};
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, BytesN, Env};

// ─── Helpers ────────────────────────────────────────────────────────────────

fn setup() -> (Env, ConfessionRegistryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let author = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin, author)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[0] = seed;
    BytesN::from_array(env, &b)
}

/// Seed `n` confessions and return the IDs in insertion order.
fn seed(client: &ConfessionRegistryClient, env: &Env, author: &Address, n: u8) -> Vec<u64> {
    (0..n)
        .map(|i| client.create_confession(author, &hash(env, i), &(1_000 + i as u64)))
        .collect()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

/// First page: cursor=None, more items remain → has_next_page=true, next_cursor=Some.
#[test]
fn first_page_has_next() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 7);

    let page = client.list_confessions(&None, &3);

    assert_eq!(page.items.len(), 3);
    assert!(page.has_next_page);
    assert_eq!(page.next_cursor, Some(3));
    // Items are in ascending ID order.
    assert_eq!(page.items.get(0).unwrap().id, 1);
    assert_eq!(page.items.get(2).unwrap().id, 3);
}

/// Middle page: cursor points into the middle, more items remain.
#[test]
fn middle_page_has_next() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 7);

    let page = client.list_confessions(&Some(3), &3);

    assert_eq!(page.items.len(), 3);
    assert!(page.has_next_page);
    assert_eq!(page.next_cursor, Some(6));
    assert_eq!(page.items.get(0).unwrap().id, 4);
    assert_eq!(page.items.get(2).unwrap().id, 6);
}

/// Terminal page: cursor points near the end, no more items remain.
#[test]
fn terminal_page_no_next() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 7);

    let page = client.list_confessions(&Some(6), &3);

    assert_eq!(page.items.len(), 1);
    assert!(!page.has_next_page);
    assert_eq!(page.next_cursor, None);
    assert_eq!(page.items.get(0).unwrap().id, 7);
}

/// Empty store: first call returns an empty terminal page.
#[test]
fn empty_store_is_terminal() {
    let (_env, client, _admin, _author) = setup();

    let page = client.list_confessions(&None, &10);

    assert_eq!(page.items.len(), 0);
    assert!(!page.has_next_page);
    assert_eq!(page.next_cursor, None);
}

/// Exact-fit page: items == limit with nothing left → terminal.
#[test]
fn exact_fit_is_terminal() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 5);

    let page = client.list_confessions(&None, &5);

    assert_eq!(page.items.len(), 5);
    assert!(!page.has_next_page);
    assert_eq!(page.next_cursor, None);
}

/// Full walk: chaining pages collects every confession exactly once.
#[test]
fn full_walk_collects_all() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 15);

    let mut cursor = None;
    let mut total = 0u32;

    loop {
        let page = client.list_confessions(&cursor, &4);
        total += page.items.len();
        if !page.has_next_page {
            break;
        }
        cursor = page.next_cursor;
    }

    assert_eq!(total, 15);
}

/// next_cursor is deterministic: same state, same cursor, same result.
#[test]
fn next_cursor_is_deterministic() {
    let (env, client, _admin, author) = setup();
    seed(&client, &env, &author, 10);

    let p1 = client.list_confessions(&None, &3);
    let p2 = client.list_confessions(&None, &3);

    assert_eq!(p1.next_cursor, p2.next_cursor);
    assert_eq!(p1.has_next_page, p2.has_next_page);
}

// ─── Report pagination ───────────────────────────────────────────────────────
//
// `report_pagination::{create, list}` are plain functions (not contract
// entrypoints), so they need a registered contract instance to run inside —
// same idiom as `event_nonce_ordering.test.rs`.

#[contract]
struct ReportPaginationHarness;

#[contractimpl]
impl ReportPaginationHarness {}

fn report_harness(env: &Env) -> Address {
    env.register(ReportPaginationHarness, ())
}

#[test]
fn report_first_page_has_next() {
    let env = Env::default();
    let id = report_harness(&env);

    env.as_contract(&id, || {
        for i in 0..7u64 {
            report_pagination::create(&env, i);
        }

        let page = report_pagination::list(&env, None, 3).unwrap();
        assert_eq!(page.items.len(), 3);
        assert!(page.has_next_page);
        assert_eq!(page.next_cursor, Some(3));
        assert_eq!(page.items.get(0).unwrap().id, 1);
        assert_eq!(page.items.get(2).unwrap().id, 3);
    });
}

#[test]
fn report_terminal_page_no_next() {
    let env = Env::default();
    let id = report_harness(&env);

    env.as_contract(&id, || {
        for i in 0..7u64 {
            report_pagination::create(&env, i);
        }

        let page = report_pagination::list(&env, Some(6), 3).unwrap();
        assert_eq!(page.items.len(), 1);
        assert!(!page.has_next_page);
        assert_eq!(page.next_cursor, None);
        assert_eq!(page.items.get(0).unwrap().id, 7);
    });
}

#[test]
fn report_insertion_between_page_fetches_causes_no_duplicates_or_skips() {
    let env = Env::default();
    let id = report_harness(&env);

    env.as_contract(&id, || {
        for i in 0..5u64 {
            report_pagination::create(&env, i);
        }

        // Caller fetches the first page...
        let page1 = report_pagination::list(&env, None, 3).unwrap();
        assert_eq!(page1.items.len(), 3);

        // ...then a new report is inserted concurrently, after the cursor.
        report_pagination::create(&env, 999);

        // Walking the rest with the cursor must see every remaining item
        // exactly once, including the newly inserted one, with no repeats.
        let mut seen: std::vec::Vec<u64> = std::vec::Vec::new();
        let mut cursor = page1.next_cursor;
        loop {
            let page = report_pagination::list(&env, cursor, 3).unwrap();
            for item in page.items.iter() {
                seen.push(item.id);
            }
            if !page.has_next_page {
                break;
            }
            cursor = page.next_cursor;
        }

        assert_eq!(seen, std::vec![4u64, 5, 6]);
    });
}

#[test]
fn report_full_walk_collects_all_exactly_once() {
    let env = Env::default();
    let id = report_harness(&env);

    env.as_contract(&id, || {
        for i in 0..15u64 {
            report_pagination::create(&env, i);
        }

        let mut cursor = None;
        let mut seen: std::vec::Vec<u64> = std::vec::Vec::new();
        loop {
            let page = report_pagination::list(&env, cursor, 4).unwrap();
            for item in page.items.iter() {
                seen.push(item.id);
            }
            if !page.has_next_page {
                break;
            }
            cursor = page.next_cursor;
        }

        assert_eq!(seen.len(), 15);
        let mut sorted = seen.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 15, "no duplicates or skips across pages");
    });
}

#[test]
fn report_limit_zero_returns_typed_error() {
    let env = Env::default();
    let id = report_harness(&env);

    env.as_contract(&id, || {
        report_pagination::create(&env, 0);
        let result = report_pagination::list(&env, None, 0);
        assert_eq!(result, Err(PaginationError::LimitZero));
    });
}

#[test]
fn report_empty_store_is_terminal() {
    let env = Env::default();
    let id = report_harness(&env);

    env.as_contract(&id, || {
        let page = report_pagination::list(&env, None, 10).unwrap();
        assert_eq!(page.items.len(), 0);
        assert!(!page.has_next_page);
        assert_eq!(page.next_cursor, None);
    });
}
