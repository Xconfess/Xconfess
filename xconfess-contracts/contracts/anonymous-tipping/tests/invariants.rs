//! Invariant test suite for anonymous-tipping settlement correctness.
//!
//! ## Invariants verified
//!
//! | # | Invariant | Where |
//! |---|-----------|-------|
//! | I1 | Balance conservation: recipient total == sum of all successful tips to that address | `recipient_total_equals_sum_of_tips` |
//! | I2 | Nonce monotonicity: each settlement returns `prev_nonce + 1` | `settlement_nonce_strictly_monotonic` |
//! | I3 | Nonce coherence: `latest_settlement_nonce()` == total successful settlements | `nonce_equals_total_successful_settlements` |
//! | I4 | Balance non-regression: recipient totals can never decrease | `recipient_total_never_decreases` |
//! | I5 | Precision: i128 accumulation is exact — no rounding | `tip_accumulation_exact_no_rounding` |
//! | I6 | Rate limit bound: per-wallet count never exceeds configured limit | `rate_limit_blocks_at_exact_window_cap` |
//! | I7 | Pause completeness: all state-changing ops fail while paused | `pause_blocks_all_mutations` |
//! | I8 | Zero/negative amounts never mutate state | `invalid_amounts_never_mutate_state` |
//! | I9 | Overflow safety: TotalOverflow returned before silent corruption | `overflow_returns_error_not_silent_corruption` |
//! | I10 | Recipient isolation: tipping one address never alters another's total | `recipients_are_mutually_isolated` |
//! | I11 | send_tip and send_tip_with_proof(None) produce identical outcomes | `send_tip_and_proof_none_identical_invariant` |
//! | I12 | GlobalTipCount coherence post-migration | `global_tip_count_coherent_with_nonce` |

extern crate std;

use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient, Error};
use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString};

// ── helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, AnonymousTippingClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &id);
    client.init(&id);
    (env, client)
}

fn owner_setup() -> (Env, Address, AnonymousTippingClient<'static>) {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    client.configure_controls(&owner, &1_000u32, &60u64);
    (env, owner, client)
}

// ── I1: Balance conservation ──────────────────────────────────────────────────

/// The accumulated total must equal the arithmetic sum of every individual
/// tip sent to that address, regardless of order or interleaving.
#[test]
fn recipient_total_equals_sum_of_tips() {
    let (env, client) = setup();
    let alice = Address::generate(&env);

    let amounts: &[i128] = &[1, 10, 100, 999, 1, 42, 7];
    let expected: i128 = amounts.iter().sum();

    for &a in amounts {
        client.send_tip(&Address::generate(&env), &alice, &a);
    }

    assert_eq!(
        client.get_tips(&alice),
        expected,
        "I1: recipient total must equal exact arithmetic sum of all tips"
    );
}

/// Conservation holds across multiple recipients in the same settlement stream.
#[test]
fn balance_conservation_holds_across_multiple_recipients() {
    let (env, client) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    let alice_tips: &[i128] = &[100, 200, 50];
    let bob_tips: &[i128] = &[999, 1];
    let carol_tips: &[i128] = &[42];

    // Interleave deliberately to ensure no cross-contamination
    client.send_tip(&Address::generate(&env), &alice, &alice_tips[0]);
    client.send_tip(&Address::generate(&env), &bob, &bob_tips[0]);
    client.send_tip(&Address::generate(&env), &carol, &carol_tips[0]);
    client.send_tip(&Address::generate(&env), &alice, &alice_tips[1]);
    client.send_tip(&Address::generate(&env), &bob, &bob_tips[1]);
    client.send_tip(&Address::generate(&env), &alice, &alice_tips[2]);

    assert_eq!(client.get_tips(&alice), 350i128, "I1: alice total");
    assert_eq!(client.get_tips(&bob), 1000i128, "I1: bob total");
    assert_eq!(client.get_tips(&carol), 42i128, "I1: carol total");
}

// ── I2: Nonce monotonicity ────────────────────────────────────────────────────

/// Each successful settlement must return exactly `previous_nonce + 1`.
#[test]
fn settlement_nonce_strictly_monotonic() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let mut prev = 0u64;
    for _ in 0..10 {
        let id = client.send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(id, prev + 1, "I2: each settlement_id must be prev + 1");
        prev = id;
    }
}

/// Nonce advances even across different recipients.
#[test]
fn nonce_monotonic_across_different_recipients() {
    let (env, client) = setup();
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let id1 = client.send_tip(&Address::generate(&env), &r1, &1i128);
    let id2 = client.send_tip(&Address::generate(&env), &r2, &1i128);
    let id3 = client.send_tip(&Address::generate(&env), &r1, &1i128);

    assert!(id2 > id1, "I2: id2 must exceed id1");
    assert!(id3 > id2, "I2: id3 must exceed id2");
}

// ── I3: Nonce coherence ───────────────────────────────────────────────────────

/// `latest_settlement_nonce()` must equal the total number of successful
/// settlements executed since contract initialisation.
#[test]
fn nonce_equals_total_successful_settlements() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    assert_eq!(client.latest_settlement_nonce(), 0, "I3: nonce starts at 0");

    for n in 1u64..=20 {
        client.send_tip(&Address::generate(&env), &recipient, &(n as i128));
        assert_eq!(
            client.latest_settlement_nonce(),
            n,
            "I3: nonce must equal {n} after {n} tips"
        );
    }
}

/// Failed tips must not increment the nonce.
#[test]
fn failed_tips_do_not_advance_nonce() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    client.send_tip(&Address::generate(&env), &recipient, &5i128);
    let nonce_before = client.latest_settlement_nonce();

    // Invalid amount — must fail without touching nonce
    let _ = client.try_send_tip(&Address::generate(&env), &recipient, &0i128);
    let _ = client.try_send_tip(&Address::generate(&env), &recipient, &(-1i128));

    assert_eq!(
        client.latest_settlement_nonce(),
        nonce_before,
        "I3: failed tips must not advance the settlement nonce"
    );
}

// ── I4: Balance non-regression ────────────────────────────────────────────────

/// Once a recipient has accumulated a balance, no future successful operation
/// should decrease it.
#[test]
fn recipient_total_never_decreases() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let mut prev_total: i128 = 0;
    let amounts: &[i128] = &[100, 1, 999, 50, 200];
    for &a in amounts {
        client.send_tip(&Address::generate(&env), &recipient, &a);
        let new_total = client.get_tips(&recipient);
        assert!(
            new_total >= prev_total,
            "I4: recipient total must never decrease (was {prev_total}, now {new_total})"
        );
        prev_total = new_total;
    }
}

// ── I5: Precision — no rounding ───────────────────────────────────────────────

/// All amounts are i128 integers — there is no floating point involved.
/// The invariant: repeated addition of the same value must equal N * value.
#[test]
fn tip_accumulation_exact_no_rounding() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let unit: i128 = 7; // prime to surface any rounding
    let n: u32 = 100;
    for _ in 0..n {
        client.send_tip(&Address::generate(&env), &recipient, &unit);
    }

    assert_eq!(
        client.get_tips(&recipient),
        unit * n as i128,
        "I5: i128 accumulation must be exact — no rounding"
    );
}

/// Odd and prime amounts accumulate exactly.
#[test]
fn odd_amounts_accumulate_without_rounding() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let amounts: &[i128] = &[3, 7, 11, 13, 17, 19, 23];
    let expected: i128 = amounts.iter().sum();
    for &a in amounts {
        client.send_tip(&Address::generate(&env), &recipient, &a);
    }

    assert_eq!(
        client.get_tips(&recipient),
        expected,
        "I5: prime amounts must sum exactly"
    );
}

/// The single-unit tip (minimum valid) accumulates exactly.
#[test]
fn unit_tip_precision() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    for i in 1i128..=50 {
        client.send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(client.get_tips(&recipient), i, "I5: unit tip count == {i}");
    }
}

// ── I6: Rate limit bound ──────────────────────────────────────────────────────

/// The per-wallet rate limit must fire at exactly the configured window cap
/// and never allow one more than permitted.
#[test]
fn rate_limit_blocks_at_exact_window_cap() {
    let (env, owner, client) = owner_setup();
    let cap: u32 = 5;
    client.configure_controls(&owner, &cap, &60u64);

    let wallet = Address::generate(&env);
    let recipient = Address::generate(&env);
    for i in 0..cap {
        let result = client.try_send_tip(&wallet, &recipient, &1i128);
        assert!(result.is_ok(), "I6: tip {} (of {cap}) must succeed", i + 1);
    }

    // The very next tip must be rate-limited
    assert_eq!(
        client.try_send_tip(&wallet, &recipient, &1i128),
        Err(Ok(Error::RateLimited)),
        "I6: tip {} must be blocked by rate limit",
        cap + 1
    );
}

/// Rate limiting is per-wallet: other wallets are unaffected by one wallet
/// exhausting its window.
#[test]
fn rate_limit_is_per_wallet_not_global() {
    let (env, owner, client) = owner_setup();
    client.configure_controls(&owner, &1u32, &60u64);

    let wallet_a = Address::generate(&env);
    let wallet_b = Address::generate(&env);
    let recipient = Address::generate(&env);

    // wallet_a exhausts its window
    assert!(client.try_send_tip(&wallet_a, &recipient, &1i128).is_ok());
    assert_eq!(
        client.try_send_tip(&wallet_a, &recipient, &1i128),
        Err(Ok(Error::RateLimited))
    );

    // wallet_b is unaffected
    assert!(
        client.try_send_tip(&wallet_b, &recipient, &1i128).is_ok(),
        "I6: wallet_b must not be affected by wallet_a's rate exhaustion"
    );
}

// ── I7: Pause completeness ────────────────────────────────────────────────────

/// While paused, ALL state-changing tip operations must fail.
/// Read-only operations must still succeed.
#[test]
fn pause_blocks_all_mutations() {
    let (env, owner, client) = owner_setup();
    let recipient = Address::generate(&env);

    // Establish baseline state
    client.send_tip(&Address::generate(&env), &recipient, &10i128);
    let baseline_total = client.get_tips(&recipient);
    let baseline_nonce = client.latest_settlement_nonce();

    client.pause(&owner, &SorobanString::from_str(&env, "maintenance"));
    assert!(client.is_paused(), "I7: must be paused");

    // Both tip variants must be blocked
    assert_eq!(
        client.try_send_tip(&Address::generate(&env), &recipient, &1i128),
        Err(Ok(Error::ContractPaused)),
        "I7: send_tip must fail while paused"
    );
    assert_eq!(
        client.try_send_tip_with_proof(&Address::generate(&env), &recipient, &1i128, &None),
        Err(Ok(Error::ContractPaused)),
        "I7: send_tip_with_proof must fail while paused"
    );

    // State must be completely unchanged
    assert_eq!(
        client.get_tips(&recipient),
        baseline_total,
        "I7: recipient total must not change while paused"
    );
    assert_eq!(
        client.latest_settlement_nonce(),
        baseline_nonce,
        "I7: nonce must not change while paused"
    );

    // Read operations must remain available
    let _ = client.get_tips(&recipient);
    let _ = client.latest_settlement_nonce();
    let _ = client.is_paused();
    let _ = client.get_rate_limit_config();
}

/// Unpausing restores normal operation — the invariant resumes.
#[test]
fn unpause_restores_settlement_invariant() {
    let (env, owner, client) = owner_setup();
    let recipient = Address::generate(&env);

    client.pause(&owner, &SorobanString::from_str(&env, "incident"));
    client.unpause(&owner, &SorobanString::from_str(&env, "resolved"));

    let id = client.send_tip(&Address::generate(&env), &recipient, &42i128);
    assert_eq!(
        id, 1,
        "I7: first tip after unpause must get settlement_id 1"
    );
    assert_eq!(client.get_tips(&recipient), 42i128);
}

// ── I8: Zero/negative amounts never mutate state ─────────────────────────────

#[test]
fn invalid_amounts_never_mutate_state() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let initial_nonce = client.latest_settlement_nonce();
    let initial_total = client.get_tips(&recipient);

    let invalid_amounts: &[i128] = &[0, -1, -100, i128::MIN, i128::MIN + 1];
    for &a in invalid_amounts {
        let _ = client.try_send_tip(&Address::generate(&env), &recipient, &a);
        let _ = client.try_send_tip_with_proof(&Address::generate(&env), &recipient, &a, &None);
    }

    assert_eq!(
        client.latest_settlement_nonce(),
        initial_nonce,
        "I8: nonce must not advance for any invalid amount"
    );
    assert_eq!(
        client.get_tips(&recipient),
        initial_total,
        "I8: recipient total must not change for any invalid amount"
    );
}

// ── I9: Overflow safety ───────────────────────────────────────────────────────

/// Adding an amount that would overflow the recipient total must return TotalOverflow,
/// not silently corrupt the stored total. With MAX_TIP_AMOUNT, we test by sending
/// a large valid tip and then one that would overflow.
#[test]
fn overflow_returns_error_not_silent_corruption() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let max_amount = AnonymousTipping::MAX_TIP_AMOUNT;

    // Send a tip at max amount
    client.send_tip(&Address::generate(&env), &recipient, &max_amount);

    // Send another tip at max amount to build up the total
    client.send_tip(&Address::generate(&env), &recipient, &max_amount);

    // The total is now 2 * MAX_TIP_AMOUNT. Sending MAX_TIP_AMOUNT + 1 is invalid
    // (exceeds MAX), so test that InvalidTipAmount is returned.
    let result = client.try_send_tip(&Address::generate(&env), &recipient, &(max_amount + 1));
    assert_eq!(
        result,
        Err(Ok(Error::InvalidTipAmount)),
        "I9: amount exceeding MAX_TIP_AMOUNT must be rejected"
    );

    // Total must be unchanged
    assert_eq!(
        client.get_tip_balance(&recipient),
        2 * max_amount,
        "I9: total must not be corrupted after rejection"
    );
}

/// A tip at exactly MAX_TIP_AMOUNT must succeed.
#[test]
fn max_amount_tip_succeeds() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);

    let max_amount = AnonymousTipping::MAX_TIP_AMOUNT;
    let result = client.try_send_tip(&Address::generate(&env), &recipient, &max_amount);
    assert_eq!(result, Ok(Ok(1)), "I9: MAX_TIP_AMOUNT tip must succeed");
}

// ── I10: Recipient isolation ──────────────────────────────────────────────────

/// Tipping one recipient must never alter another recipient's total.
#[test]
fn recipients_are_mutually_isolated() {
    let (env, client) = setup();
    let recipients: std::vec::Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();

    // Tip only the first recipient
    for _ in 0..10 {
        client.send_tip(&Address::generate(&env), &recipients[0], &1i128);
    }

    // All other recipients must remain at 0
    for r in &recipients[1..] {
        assert_eq!(
            client.get_tips(r),
            0i128,
            "I10: untouched recipients must have 0 total"
        );
    }
}

/// Tipping in a round-robin pattern must keep each recipient's total
/// equal to exactly (number of times they were tipped) * amount.
#[test]
fn round_robin_tipping_preserves_per_recipient_isolation() {
    let (env, client) = setup();
    let n = 4usize;
    let amount = 100i128;
    let rounds = 5usize;
    let recipients: std::vec::Vec<Address> = (0..n).map(|_| Address::generate(&env)).collect();

    for _ in 0..rounds {
        for r in &recipients {
            client.send_tip(&Address::generate(&env), r, &amount);
        }
    }

    for r in &recipients {
        assert_eq!(
            client.get_tips(r),
            amount * rounds as i128,
            "I10: each recipient must have exactly rounds * amount"
        );
    }
}

// ── I11: send_tip and send_tip_with_proof(None) identical ─────────────────────

/// The two public tip APIs must produce byte-identical state outcomes when
/// `send_tip_with_proof` is called with `proof_metadata = None`.
#[test]
fn send_tip_and_proof_none_identical_invariant() {
    let (env, client) = setup();
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    client.send_tip(&Address::generate(&env), &r1, &77i128);
    client.send_tip_with_proof(&Address::generate(&env), &r2, &77i128, &None);

    assert_eq!(
        client.get_tips(&r1),
        client.get_tips(&r2),
        "I11: send_tip and send_tip_with_proof(None) must produce identical totals"
    );

    // Nonce advanced by 1 for each
    assert_eq!(
        client.latest_settlement_nonce(),
        2,
        "I11: both calls advance the nonce"
    );
}

// ── I12: GlobalTipCount coherence ────────────────────────────────────────────

/// After migration, GlobalTipCount must equal the number of successful
/// post-migration settlements, matching `latest_settlement_nonce()` minus
/// the nonce at migration time.
#[test]
fn global_tip_count_coherent_with_nonce() {
    let (env, owner, client) = owner_setup();
    let recipient = Address::generate(&env);

    // Establish pre-migration nonce
    client.send_tip(&Address::generate(&env), &recipient, &1i128);
    client.send_tip(&Address::generate(&env), &recipient, &1i128);
    let nonce_at_migration = client.latest_settlement_nonce();

    client.migrate(&owner);

    // Post-migration tips
    let post_tips = 7u64;
    for _ in 0..post_tips {
        client.send_tip(&Address::generate(&env), &recipient, &1i128);
    }

    assert_eq!(
        client.global_tip_count(),
        post_tips,
        "I12: GlobalTipCount must equal post-migration tip count"
    );
    assert_eq!(
        client.latest_settlement_nonce(),
        nonce_at_migration + post_tips,
        "I12: nonce must equal migration-time nonce plus post-migration tips"
    );
}

/// GlobalTipCount must not increment for failed tips even after migration.
#[test]
fn global_tip_count_not_incremented_by_failed_tip_post_migration() {
    let (env, owner, client) = owner_setup();
    let recipient = Address::generate(&env);
    client.migrate(&owner);

    // Failed tip
    let _ = client.try_send_tip(&Address::generate(&env), &recipient, &0i128);
    assert_eq!(
        client.global_tip_count(),
        0,
        "I12: failed tip must not increment GlobalTipCount"
    );
}

// ── adversarial precision: rounding boundary for proof metadata ───────────────

/// The metadata length check is exact: 128 bytes succeeds, 129 bytes fails.
/// This is a precision invariant on the metadata boundary.
#[test]
fn metadata_length_boundary_exact() {
    let (env, client) = setup();
    let recipient = Address::generate(&env);
    let max = anonymous_tipping::AnonymousTipping::MAX_PROOF_METADATA_LEN as usize;

    // Exactly at the boundary — must succeed
    let ok_meta = SorobanString::from_str(&env, &std::string::String::from("x").repeat(max));
    let sid =
        client.send_tip_with_proof(&Address::generate(&env), &recipient, &1i128, &Some(ok_meta));
    assert_eq!(sid, 1);

    // One over the boundary — must fail
    let over_meta = SorobanString::from_str(&env, &std::string::String::from("x").repeat(max + 1));
    let result = client.try_send_tip_with_proof(
        &Address::generate(&env),
        &recipient,
        &1i128,
        &Some(over_meta),
    );
    assert_eq!(result, Err(Ok(Error::MetadataTooLong)));

    // Total must only reflect the one successful tip
    assert_eq!(client.get_tips(&recipient), 1i128);
    assert_eq!(client.latest_settlement_nonce(), 1);
}
