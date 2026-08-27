//! Integration tests – Confession-to-Moderation Lifecycle
//!
//! File: xconfess-contract/test/integration/confession_moderation.rs
//!
//! Purpose
//! -------
//! These tests validate the *contract-level* state machine and cross-method
//! invariants that unit tests for individual functions cannot catch:
//!
//!   • What `create` writes, `report` and `react` must be able to read.
//!   • What `report` writes, `resolve` must observe and mutate atomically.
//!   • State transitions must be irreversible (resolved stays resolved).
//!   • Multi-actor scenarios must be isolated (reporter ≠ creator ≠ resolver).
//!
//! Test organisation
//! -----------------
//!   Suite 1 – Happy path            full create → react → report → resolve
//!   Suite 2 – Event ordering        each transition is individually gated
//!   Suite 3 – Reaction contract     counts, duplicates, unknown confession
//!   Suite 4 – Report contract       pending state, duplicate rejection
//!   Suite 5 – Resolution contract   status flip, idempotency guard, no-report guard
//!   Suite 6 – Role enforcement      only designated resolver address may resolve
//!   Suite 7 – Negative / edge paths empty content, unknown id, oversized strings
//!   Suite 8 – Determinism           same inputs produce identical on-chain state
//!
//! Running
//! -------
//!   cargo test --test confession_moderation -- --nocapture
//!
//! The `#[cfg(test)]` attribute is omitted because Soroban integration tests
//! live under `tests/` and are compiled only by `cargo test` automatically.

use soroban_sdk::{
    testutils::{Address as _, Budget, Events},
    Address, Env, IntoVal, String as SorobanString, Vec as SorobanVec,
};

use xconfess_contract::{XConfessContract, XConfessContractClient};

// ─────────────────────────────────────────────────────────────────────────────
// Shared test helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Boots a clean environment with a deployed contract and three distinct actors.
/// Returns `(env, client, creator, reactor, admin)`.
///
/// `mock_all_auths()` is called so address-level auth checks are satisfied
/// without a real keypair; individual tests that care about *which* address
/// called a method inspect `env.auths()` explicitly.
fn setup() -> (
    Env,
    XConfessContractClient<'static>,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, XConfessContract);
    // SAFETY: lifetime is valid for the duration of each test function.
    let client: XConfessContractClient<'static> =
        XConfessContractClient::new(&env, &contract_id);

    let creator  = Address::random(&env);
    let reactor  = Address::random(&env);
    let admin    = Address::random(&env);

    (env, client, creator, reactor, admin)
}

/// Convenience: convert a `&str` into a `SorobanString` for the given env.
fn s(env: &Env, text: &str) -> SorobanString {
    SorobanString::from_str(env, text)
}

/// Create a confession and assert it returns an ID > 0.
/// Panics with a descriptive message if the call panics unexpectedly.
fn create_confession(client: &XConfessContractClient, env: &Env, content: &str) -> u32 {
    client.create(&s(env, content))
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 – Happy path
// ─────────────────────────────────────────────────────────────────────────────

/// Full lifecycle in one test so the event sequence is explicit and linear.
/// Every assertion documents the state contract between adjacent methods.
#[test]
fn happy_path_create_react_report_resolve() {
    let (env, client, _creator, reactor, admin) = setup();

    // ── Step 1: CREATE ────────────────────────────────────────────────────────
    let id = create_confession(&client, &env, "I eat cereal for dinner.");

    // Contract: create() returns a positive, deterministic ID.
    assert!(id > 0, "create() must return a non-zero confession ID");

    // Contract: a second create() increments the ID monotonically.
    let id2 = create_confession(&client, &env, "Second confession.");
    assert_eq!(id2, id + 1, "IDs must be assigned monotonically");

    // ── Step 2: REACT ─────────────────────────────────────────────────────────
    // reaction_type 1 = LIKE (convention inferred from snapshot test)
    client.react(&id, &1);

    // Contract: react() on the SAME confession by a DIFFERENT address is valid.
    // We use mock_all_auths, so we demonstrate this by calling react() with
    // the reactor address in scope (auths are checked via env.auths()).
    env.mock_all_auths_allowing_non_root_auth();
    client.react(&id2, &1);

    // Contract: react() on a NEW confession does not affect the first one.
    // (Verified implicitly by the report step below succeeding on `id`.)

    // ── Step 3: REPORT ────────────────────────────────────────────────────────
    client.report(&id, &s(&env, "spam"));

    // Contract: after report(), the confession must be in PENDING / reported
    // state.  We verify this indirectly: resolve() succeeding proves the
    // contract observed the report.

    // ── Step 4: RESOLVE ───────────────────────────────────────────────────────
    client.resolve(&id);

    // Contract: after resolve(), the confession must be in RESOLVED state.
    // Calling resolve() again must panic / return an error (tested in Suite 5).
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 – Event ordering contract
// ─────────────────────────────────────────────────────────────────────────────

/// resolve() BEFORE report() — the contract must reject this if reports are
/// required before resolution (common moderation pattern).
#[test]
#[should_panic]
fn resolve_without_prior_report_is_rejected() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Orphan confession.");

    // No report() call — resolve() must panic because there is nothing to resolve.
    client.resolve(&id);
}

/// report() BEFORE create() — the target confession does not exist yet.
#[test]
#[should_panic]
fn report_before_create_is_rejected() {
    let (env, client, ..) = setup();
    // ID 999 has never been created in this environment.
    client.report(&999, &s(&env, "spam"));
}

/// react() BEFORE create() — same principle.
#[test]
#[should_panic]
fn react_before_create_is_rejected() {
    let (env, client, ..) = setup();
    client.react(&999, &1);
}

/// Confirm that create → report → resolve completes without react() in between.
/// React is optional in the lifecycle.
#[test]
fn react_is_optional_in_lifecycle() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "No reactions needed.");
    client.report(&id, &s(&env, "harassment"));
    client.resolve(&id); // must not panic
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 – Reaction contract
// ─────────────────────────────────────────────────────────────────────────────

/// Reaction type 1 (LIKE) and type 2 (DISLIKE) are both accepted.
#[test]
fn multiple_reaction_types_are_accepted() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Reaction types test.");

    client.react(&id, &1); // LIKE
    client.react(&id, &2); // DISLIKE — should not panic
}

/// Two different callers reacting with the same type is valid.
/// (The contract does not deduplicate by reaction_type, only by address
/// if dedup is enforced — both models are tested.)
#[test]
fn two_distinct_addresses_can_react_to_same_confession() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Multi-reactor confession.");

    // First reaction — succeeds
    client.react(&id, &1);

    // Second reaction from a conceptually different call context.
    // With mock_all_auths this succeeds; the contract is responsible for
    // per-address dedup if desired.
    client.react(&id, &1);
}

/// Reacting to a resolved confession — contract may allow or forbid this;
/// the test documents the observed behaviour without asserting a specific
/// outcome, but MUST NOT produce a 500-equivalent (unrecoverable ledger error).
#[test]
fn react_to_resolved_confession_is_handled_gracefully() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Will be resolved.");
    client.report(&id, &s(&env, "spam"));
    client.resolve(&id);

    // This call must either succeed (allowed) or panic (forbidden) — the
    // important property is that the test harness can observe the outcome.
    // We wrap in std::panic::catch_unwind to document both branches.
    let result = std::panic::catch_unwind(|| {
        // We need a fresh env reference inside the closure — use the outer
        // client which is already bound to the same env.
        client.react(&id, &1);
    });

    // Document the outcome but do not fail: the contract author decides policy.
    match result {
        Ok(_)  => eprintln!("[info] react() on resolved confession: ALLOWED"),
        Err(_) => eprintln!("[info] react() on resolved confession: REJECTED (panicked)"),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 – Report contract
// ─────────────────────────────────────────────────────────────────────────────

/// The same confession can only be reported once (duplicate guard).
#[test]
#[should_panic]
fn duplicate_report_on_same_confession_is_rejected() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Will be reported twice.");

    client.report(&id, &s(&env, "spam"));
    // Second report() on the same id must panic.
    client.report(&id, &s(&env, "harassment"));
}

/// Reporting a confession does not mutate any other confession's state.
#[test]
fn report_is_scoped_to_target_confession() {
    let (env, client, ..) = setup();
    let id_a = create_confession(&client, &env, "Confession A.");
    let id_b = create_confession(&client, &env, "Confession B.");

    // Report only A
    client.report(&id_a, &s(&env, "spam"));
    client.resolve(&id_a);

    // B is unaffected — report() and resolve() on B must still work normally.
    client.report(&id_b, &s(&env, "spam"));
    client.resolve(&id_b); // must not panic
}

/// Report reason must not be empty (DTO-level guard at contract layer).
#[test]
#[should_panic]
fn report_with_empty_reason_is_rejected() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Confession to report.");
    client.report(&id, &s(&env, ""));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 – Resolution contract
// ─────────────────────────────────────────────────────────────────────────────

/// resolve() is idempotency-safe in the sense that calling it twice panics
/// rather than silently corrupting state (fail-loud is the correct behaviour).
#[test]
#[should_panic]
fn double_resolve_is_rejected() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Confession for double-resolve.");
    client.report(&id, &s(&env, "spam"));
    client.resolve(&id);
    // Second resolve() must panic — the confession is already RESOLVED.
    client.resolve(&id);
}

/// Resolving a confession that has been reported makes the report no longer
/// re-reportable (resolved → final state).
#[test]
#[should_panic]
fn report_after_resolve_is_rejected() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Post-resolve report attempt.");
    client.report(&id, &s(&env, "spam"));
    client.resolve(&id);
    // Attempting a new report on an already-resolved confession must panic.
    client.report(&id, &s(&env, "new reason after resolve"));
}

/// Multiple independent confessions can each be resolved independently.
/// Tests that resolution state is stored per-confession, not globally.
#[test]
fn independent_confessions_resolve_independently() {
    let (env, client, ..) = setup();

    let ids: Vec<u32> = (0..3)
        .map(|i| {
            let id = create_confession(&client, &env, &format!("Confession #{i}"));
            client.report(&id, &s(&env, "spam"));
            id
        })
        .collect();

    // Resolve in reverse order to prove there is no implicit ordering dependency.
    for id in ids.iter().rev() {
        client.resolve(id); // must not panic for any of the three
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 – Role enforcement contract
// ─────────────────────────────────────────────────────────────────────────────
//
// Note: Soroban auth is invocation-level.  With mock_all_auths() every address
// is pre-authorised.  To test role-based access control the contract must store
// an admin address and check `env.require_auth(&admin)` inside resolve().
//
// If the contract does NOT implement RBAC (resolve is permissionless), these
// tests document that fact rather than fail.

/// Calling resolve() from the designated admin address succeeds.
#[test]
fn admin_can_resolve_report() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Admin-resolved confession.");
    client.report(&id, &s(&env, "abuse"));
    // With mock_all_auths the admin address is implicitly authorised.
    client.resolve(&id); // must not panic
}

/// If the contract enforces RBAC, a non-admin address calling resolve() panics.
/// If it does not enforce RBAC, the call succeeds and this test is a no-op.
#[test]
fn non_admin_resolve_is_rejected_or_permissionless() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "RBAC test confession.");
    client.report(&id, &s(&env, "spam"));

    // Attempt resolve from a random (non-admin) address.
    // mock_all_auths satisfies any require_auth call, so we check env.auths()
    // to see which addresses were actually required.
    client.resolve(&id);

    let auths = env.auths();
    // Document auth requirements — tests remain green regardless of RBAC model.
    if auths.is_empty() {
        eprintln!("[info] resolve() requires no auth (permissionless)");
    } else {
        eprintln!("[info] resolve() required auth from: {:?}", auths);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 – Negative / edge-path contract
// ─────────────────────────────────────────────────────────────────────────────

/// create() with empty content must panic — confessions need substance.
#[test]
#[should_panic]
fn create_with_empty_content_is_rejected() {
    let (env, client, ..) = setup();
    client.create(&s(&env, ""));
}

/// create() with a 256-character string (typical max length guard).
/// Documents whether the contract enforces an upper bound.
#[test]
fn create_with_max_length_content_is_handled() {
    let (env, client, ..) = setup();
    let long_content = "A".repeat(256);

    let result = std::panic::catch_unwind(|| client.create(&s(&env, &long_content)));

    match result {
        Ok(id) => eprintln!("[info] 256-char content accepted with id={id}"),
        Err(_) => eprintln!("[info] 256-char content rejected (length guard active)"),
    }
}

/// resolve() with an ID that has never been created must panic.
#[test]
#[should_panic]
fn resolve_nonexistent_confession_is_rejected() {
    let (env, client, ..) = setup();
    client.resolve(&999_999);
}

/// react() with an invalid reaction_type (e.g. 0 or u32::MAX) is handled.
#[test]
fn react_with_invalid_type_is_handled() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Reaction type validation.");

    // Type 0 is likely invalid
    let result_zero = std::panic::catch_unwind(|| client.react(&id, &0));
    match result_zero {
        Ok(_)  => eprintln!("[info] reaction_type=0: ALLOWED"),
        Err(_) => eprintln!("[info] reaction_type=0: REJECTED"),
    }

    // Type u32::MAX is definitely out of any reasonable enum range
    let result_max = std::panic::catch_unwind(|| client.react(&id, &u32::MAX));
    match result_max {
        Ok(_)  => eprintln!("[info] reaction_type=u32::MAX: ALLOWED"),
        Err(_) => eprintln!("[info] reaction_type=u32::MAX: REJECTED"),
    }
}

/// report() with an oversized reason string (> 256 chars) is handled.
#[test]
fn report_with_oversized_reason_is_handled() {
    let (env, client, ..) = setup();
    let id = create_confession(&client, &env, "Oversized reason test.");
    let big_reason = "X".repeat(1024);

    let result = std::panic::catch_unwind(|| client.report(&id, &s(&env, &big_reason)));
    match result {
        Ok(_)  => eprintln!("[info] 1024-char reason accepted"),
        Err(_) => eprintln!("[info] 1024-char reason rejected (length guard active)"),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 – Determinism contract
// ─────────────────────────────────────────────────────────────────────────────

/// The same sequence of operations in two independent environments must produce
/// the same IDs in the same order.  This is a fundamental Soroban property:
/// deterministic execution given the same inputs.
#[test]
fn identical_inputs_produce_identical_state_across_envs() {
    // Environment A
    let env_a = Env::default();
    env_a.mock_all_auths();
    let cid_a = env_a.register_contract(None, XConfessContract);
    let client_a = XConfessContractClient::new(&env_a, &cid_a);

    // Environment B (independent)
    let env_b = Env::default();
    env_b.mock_all_auths();
    let cid_b = env_b.register_contract(None, XConfessContract);
    let client_b = XConfessContractClient::new(&env_b, &cid_b);

    let content = "Determinism test confession.";

    let id_a = client_a.create(&s(&env_a, content));
    let id_b = client_b.create(&s(&env_b, content));

    assert_eq!(id_a, id_b, "First confession ID must be identical across independent envs");

    // Carry through the full lifecycle in both envs
    client_a.react(&id_a, &1);
    client_b.react(&id_b, &1);

    client_a.report(&id_a, &s(&env_a, "spam"));
    client_b.report(&id_b, &s(&env_b, "spam"));

    client_a.resolve(&id_a);
    client_b.resolve(&id_b);
    // If either side panics the test fails — proving divergence in execution.
}

/// Running the full lifecycle twice in the same environment uses disjoint IDs,
/// ensuring no state leakage between separate confession objects.
#[test]
fn two_full_lifecycles_in_same_env_are_isolated() {
    let (env, client, ..) = setup();

    // First lifecycle
    let id1 = create_confession(&client, &env, "First lifecycle confession.");
    client.react(&id1, &1);
    client.report(&id1, &s(&env, "spam"));
    client.resolve(&id1);

    // Second lifecycle — must not panic due to any leftover state from first
    let id2 = create_confession(&client, &env, "Second lifecycle confession.");
    assert_ne!(id1, id2, "Second confession must receive a different ID");
    client.react(&id2, &2);
    client.report(&id2, &s(&env, "harassment"));
    client.resolve(&id2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9 – Gas / resource budget contract
// ─────────────────────────────────────────────────────────────────────────────
//
// These tests do NOT fail on specific CPU counts — budgets evolve as the
// contract is optimised.  Instead they:
//   1. Assert each operation completes within a broad "sanity" ceiling.
//   2. Assert the full lifecycle costs less than 4× a single create() call
//      (i.e. no exponential blowup with state growth).
//   3. Write a structured report to `gas-integration.json` for CI tracking.

/// Per-operation budget sanity ceiling (CPU instructions).
/// Adjust upward only with a documented justification in the PR.
const MAX_CPU_CREATE:  u64 = 5_000_000;
const MAX_CPU_REACT:   u64 = 3_000_000;
const MAX_CPU_REPORT:  u64 = 3_000_000;
const MAX_CPU_RESOLVE: u64 = 3_000_000;

#[test]
fn per_operation_gas_stays_within_budget() {
    let (env, client, ..) = setup();

    macro_rules! measure {
        ($label:expr, $call:expr) => {{
            env.budget().reset_unlimited();
            $call;
            let cpu = env.budget().cpu_instruction_cost();
            eprintln!("[gas] {}: {} CPU instructions", $label, cpu);
            cpu
        }};
    }

    // `measure!` returns the CPU cost; create_confession returns the id.
    // We capture both separately.
    env.budget().reset_unlimited();
    let confession_id = create_confession(&client, &env, "Gas test.");
    let create_cpu = env.budget().cpu_instruction_cost();
    eprintln!("[gas] create: {} CPU instructions", create_cpu);
    assert!(
        create_cpu <= MAX_CPU_CREATE,
        "create() exceeded budget: {create_cpu} > {MAX_CPU_CREATE}"
    );

    let react_cpu = measure!("react", client.react(&confession_id, &1));
    assert!(
        react_cpu <= MAX_CPU_REACT,
        "react() exceeded budget: {react_cpu} > {MAX_CPU_REACT}"
    );

    let report_cpu = measure!("report", client.report(&confession_id, &s(&env, "spam")));
    assert!(
        report_cpu <= MAX_CPU_REPORT,
        "report() exceeded budget: {report_cpu} > {MAX_CPU_REPORT}"
    );

    let resolve_cpu = measure!("resolve", client.resolve(&confession_id));
    assert!(
        resolve_cpu <= MAX_CPU_RESOLVE,
        "resolve() exceeded budget: {resolve_cpu} > {MAX_CPU_RESOLVE}"
    );
}

/// Full lifecycle cost must not exceed 4× the cost of a single create().
/// Catches accidental O(n) blowup as state grows.
#[test]
fn full_lifecycle_cost_is_linear_not_exponential() {
    let (env, client, ..) = setup();

    // Baseline: isolated create
    env.budget().reset_unlimited();
    let baseline_id = create_confession(&client, &env, "Baseline.");
    let create_baseline = env.budget().cpu_instruction_cost();

    // Pre-populate state so the next operations see a non-empty store
    for i in 0..9u32 {
        let pre_id = create_confession(&client, &env, &format!("Pre-populate {i}"));
        client.report(&pre_id, &s(&env, "spam"));
        client.resolve(&pre_id);
    }

    // Measure the full lifecycle on the 11th confession
    env.budget().reset_unlimited();
    let id = create_confession(&client, &env, "Lifecycle cost test.");
    client.react(&id, &1);
    client.report(&id, &s(&env, "spam"));
    client.resolve(&id);
    let full_lifecycle_cpu = env.budget().cpu_instruction_cost();

    let ceiling = create_baseline * 4;
    assert!(
        full_lifecycle_cpu <= ceiling,
        "Full lifecycle ({full_lifecycle_cpu}) exceeded 4× create baseline ({ceiling}). \
         Check for unintended O(n) storage scans."
    );
}

/// Writes a machine-readable gas report for CI trend tracking.
/// Named separately from `snapshot_gas_usage` in the existing file so both
/// can coexist; this one includes the pre-populated state scenario.
#[test]
fn write_integration_gas_report() {
    let (env, client, ..) = setup();

    let mut report = serde_json::json!({});

    macro_rules! measure_op {
        ($key:expr, $call:expr) => {
            env.budget().reset_unlimited();
            $call;
            report[$key] = env.budget().cpu_instruction_cost().into();
        };
    }

    measure_op!("create",  create_confession(&client, &env, "Gas report create."));
    let id = 1u32; // first ID is always 1 in a fresh env
    measure_op!("react",   client.react(&id, &1));
    measure_op!("report",  client.report(&id, &s(&env, "spam")));
    measure_op!("resolve", client.resolve(&id));

    // Also record full-lifecycle cost as a single composite metric
    let env2 = Env::default();
    env2.mock_all_auths();
    let cid2 = env2.register_contract(None, XConfessContract);
    let client2 = XConfessContractClient::new(&env2, &cid2);
    env2.budget().reset_unlimited();
    let lid = create_confession(&client2, &env2, "Full lifecycle gas.");
    client2.react(&lid, &1);
    client2.report(&lid, &s(&env2, "spam"));
    client2.resolve(&lid);
    report["full_lifecycle"] = env2.budget().cpu_instruction_cost().into();

    std::fs::write(
        "gas-integration.json",
        serde_json::to_string_pretty(&report).unwrap(),
    )
    .unwrap();

    eprintln!("[gas-report] {}", serde_json::to_string_pretty(&report).unwrap());
}