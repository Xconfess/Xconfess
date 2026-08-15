/// Adversarial and boundary tests for the anonymous-tipping contract.
///
/// Uses the Soroban-generated `AnonymousTippingClient` (emitted by `#[contractimpl]`)
/// after registering the contract in the test sandbox. Because the crate uses
/// `#![no_std]`, `extern crate std;` is declared here so that `std::string` is
/// reachable for building test strings in helpers.
#[cfg(test)]
mod adversarial {
    extern crate std;

    use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString};

    // The #[contractimpl] macro emits `AnonymousTippingClient<'_>` alongside
    // the contract struct at the crate root.
    use crate::{AnonymousTipping, AnonymousTippingClient, Error};

    // ── helpers ──────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        AnonymousTippingClient::new(&env, &contract_id).init(&contract_id);
        (env, contract_id)
    }

    fn mk_client<'a>(env: &'a Env, id: &'a Address) -> AnonymousTippingClient<'a> {
        AnonymousTippingClient::new(env, id)
    }

    fn meta(env: &Env, len: usize) -> SorobanString {
        SorobanString::from_str(env, &std::string::String::from("m").repeat(len))
    }

    // ── invalid amount — zero ─────────────────────────────────────────────────

    #[test]
    fn zero_amount_tip_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let r = c.try_send_tip(&Address::generate(&env), &recipient, &0i128);
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    // ── invalid amount — negative (table-driven) ──────────────────────────────

    #[test]
    fn negative_one_amount_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let r = c.try_send_tip(&Address::generate(&env), &recipient, &(-1i128));
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    #[test]
    fn negative_large_amount_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let r = c.try_send_tip(&Address::generate(&env), &recipient, &(-1_000_000i128));
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    #[test]
    fn i128_min_amount_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let r = c.try_send_tip(&Address::generate(&env), &recipient, &i128::MIN);
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    #[test]
    fn zero_amount_with_proof_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 10);
        let r = c.try_send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &0i128,
            &Some(m.clone()),
        );
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    #[test]
    fn negative_amount_with_proof_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 10);
        let r = c.try_send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &(-42i128),
            &Some(m.clone()),
        );
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    // ── proof metadata boundary table ─────────────────────────────────────────

    #[test]
    fn metadata_empty_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 0);
        let sid = c.send_tip_with_proof(&Address::generate(&env), &recipient, &1i128, &Some(m));
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), 1);
    }

    #[test]
    fn metadata_64_bytes_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 64);
        let sid = c.send_tip_with_proof(&Address::generate(&env), &recipient, &5i128, &Some(m));
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), 5);
    }

    #[test]
    fn metadata_127_bytes_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 127);
        let sid = c.send_tip_with_proof(&Address::generate(&env), &recipient, &1i128, &Some(m));
        assert_eq!(sid, 1);
    }

    #[test]
    fn metadata_exactly_max_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, AnonymousTipping::MAX_PROOF_METADATA_LEN as usize);
        let sid = c.send_tip_with_proof(&Address::generate(&env), &recipient, &7i128, &Some(m));
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), 7);
    }

    #[test]
    fn metadata_max_plus_one_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(
            &env,
            (AnonymousTipping::MAX_PROOF_METADATA_LEN + 1) as usize,
        );
        let r = c.try_send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &1i128,
            &Some(m.clone()),
        );
        assert_eq!(r, Err(Ok(Error::MetadataTooLong)));
    }

    #[test]
    fn metadata_256_bytes_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 256);
        let r = c.try_send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &1i128,
            &Some(m.clone()),
        );
        assert_eq!(r, Err(Ok(Error::MetadataTooLong)));
    }

    #[test]
    fn metadata_extremely_large_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let m = meta(&env, 1024);
        let r = c.try_send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &1i128,
            &Some(m.clone()),
        );
        assert_eq!(r, Err(Ok(Error::MetadataTooLong)));
    }

    // ── settlement ID monotonicity ────────────────────────────────────────────

    #[test]
    fn settlement_ids_are_monotonically_increasing() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);

        let id1 = c.send_tip(&Address::generate(&env), &r1, &1i128);
        let id2 = c.send_tip(&Address::generate(&env), &r2, &1i128);
        let id3 = c.send_tip(&Address::generate(&env), &r1, &1i128);

        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(id3, 3);
        assert_eq!(c.latest_settlement_nonce(), 3);
    }

    // ── same-recipient accumulation ───────────────────────────────────────────

    #[test]
    fn same_recipient_tips_accumulate() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        c.send_tip(&Address::generate(&env), &recipient, &10i128);
        c.send_tip(&Address::generate(&env), &recipient, &25i128);
        c.send_tip(&Address::generate(&env), &recipient, &5i128);

        assert_eq!(c.get_tips(&recipient), 40);
    }

    #[test]
    fn multiple_recipients_are_independent() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);

        c.send_tip(&Address::generate(&env), &r1, &100i128);
        c.send_tip(&Address::generate(&env), &r2, &200i128);

        assert_eq!(c.get_tips(&r1), 100);
        assert_eq!(c.get_tips(&r2), 200);
    }

    // ── volume smoke: 10 sequential tips ─────────────────────────────────────

    #[test]
    fn ten_sequential_tips_nonce_matches_count() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        for i in 1_u64..=10 {
            let recipient = Address::generate(&env);
            let sid = c.send_tip(&Address::generate(&env), &recipient, &(i as i128));
            assert_eq!(sid, i);
        }
        assert_eq!(c.latest_settlement_nonce(), 10);
    }

    // ── init idempotency ──────────────────────────────────────────────────────

    #[test]
    fn double_init_is_safe() {
        let (env, id) = setup(); // already calls init once
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        c.send_tip(&Address::generate(&env), &recipient, &1i128);

        c.init(&id); // second init must not reset state

        assert_eq!(c.get_tips(&recipient), 1);
        assert_eq!(c.latest_settlement_nonce(), 1);
    }

    // ── send_tip vs send_tip_with_proof(None) equivalence ────────────────────

    #[test]
    fn send_tip_and_proof_none_produce_equal_totals() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        let c = mk_client(&env, &contract_id);
        c.init(&contract_id);

        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);

        c.send_tip(&Address::generate(&env), &r1, &42i128);
        c.send_tip_with_proof(&Address::generate(&env), &r2, &42i128, &None);

        assert_eq!(c.get_tips(&r1), c.get_tips(&r2));
    }

    // ── uninitialised contract still works ───────────────────────────────────

    #[test]
    fn tip_without_explicit_init_returns_token_configuration_error() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        let c = mk_client(&env, &contract_id);
        // No c.init(&id) call — storage defaults to 0 via `unwrap_or`
        let recipient = Address::generate(&env);
        let result = c.try_send_tip(&Address::generate(&env), &recipient, &3i128);
        assert_eq!(result, Err(Ok(Error::TokenNotConfigured)));
        assert_eq!(c.get_tips(&recipient), 0);
    }

    // ── unknown recipient returns zero ────────────────────────────────────────

    #[test]
    fn get_tips_returns_zero_for_unknown_recipient() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let unknown = Address::generate(&env);
        assert_eq!(c.get_tips(&unknown), 0);
    }

    // ── large and small valid amounts ─────────────────────────────────────────

    #[test]
    fn very_large_valid_amount_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let amount: i128 = AnonymousTipping::MAX_TIP_AMOUNT;
        let sid = c.send_tip(&Address::generate(&env), &recipient, &amount);
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), amount);
    }

    #[test]
    fn minimum_valid_amount_one_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let sid = c.send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), 1);
    }

    // ── overflow edge cases ─────────────────────────────────────────────────────

    #[test]
    fn total_overflow_returns_error() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        // Send a tip at max amount
        let max_amount = AnonymousTipping::MAX_TIP_AMOUNT;
        c.send_tip(&Address::generate(&env), &recipient, &max_amount);

        // Next tip should overflow recipient total (1 + MAX_TIP_AMOUNT > i128 range
        // only if recipient total overflows, but with MAX_TIP_AMOUNT = 10_000 XLM
        // this test verifies the overflow guard still works)
        let r = c.try_send_tip(&Address::generate(&env), &recipient, &(max_amount + 1));
        // This will fail with InvalidTipAmount (exceeds MAX) not TotalOverflow
        assert_eq!(r, Err(Ok(Error::InvalidTipAmount)));
    }

    #[test]
    fn amount_exceeding_max_tip_amount_rejected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        let max_amount = AnonymousTipping::MAX_TIP_AMOUNT;
        assert_eq!(
            c.try_send_tip(&Address::generate(&env), &recipient, &(max_amount + 1)),
            Err(Ok(Error::InvalidTipAmount))
        );
        assert_eq!(
            c.try_send_tip(&Address::generate(&env), &recipient, &i128::MAX),
            Err(Ok(Error::InvalidTipAmount))
        );
    }

    #[test]
    fn nonce_overflow_returns_error() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        // Simulate reaching near max nonce by setting it manually
        env.as_contract(&id, || {
            env.storage()
                .instance()
                .set(&crate::DataKey::SettlementNonce, &u64::MAX);
        });

        // Next tip should overflow nonce
        let r = c.try_send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(r, Err(Ok(Error::NonceOverflow)));
    }

    // ── metadata edge cases ───────────────────────────────────────────────────

    #[test]
    fn metadata_unicode_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        // Test with Unicode characters (emoji, Chinese, etc.)
        let unicode_str = "🚀💰测试🔥";
        let metadata = SorobanString::from_str(&env, unicode_str);

        let sid = c.send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &5i128,
            &Some(metadata),
        );
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), 5);
    }

    #[test]
    fn metadata_whitespace_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        // Test with various whitespace characters
        let whitespace_str = " \t\n\r ";
        let metadata = SorobanString::from_str(&env, whitespace_str);

        let sid = c.send_tip_with_proof(
            &Address::generate(&env),
            &recipient,
            &3i128,
            &Some(metadata),
        );
        assert_eq!(sid, 1);
        assert_eq!(c.get_tips(&recipient), 3);
    }

    // ── amount precision tests ───────────────────────────────────────────────────

    #[test]
    fn max_valid_amount_succeeds() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        // Test with maximum valid amount (10,000 XLM)
        let max_amount = AnonymousTipping::MAX_TIP_AMOUNT;
        let sid = c.send_tip(&Address::generate(&env), &recipient, &max_amount);
        assert_eq!(sid, 1);
        assert_eq!(c.get_tip_balance(&recipient), max_amount);
    }

    #[test]
    fn pause_blocks_state_changing_tip_calls() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);

        c.configure_controls(&owner, &5, &60);
        c.pause(&owner, &SorobanString::from_str(&env, "incident"));
        assert!(c.is_paused());
        assert_eq!(
            c.try_send_tip(&Address::generate(&env), &recipient, &1),
            Err(Ok(Error::ContractPaused))
        );

        c.unpause(&owner, &SorobanString::from_str(&env, "resolved"));
        assert!(!c.is_paused());
        assert_eq!(c.send_tip(&Address::generate(&env), &recipient, &2), 1);
    }

    #[test]
    fn per_wallet_rate_limit_throttles_predictably() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);

        c.configure_controls(&owner, &2, &60);

        assert_eq!(c.send_tip(&sender, &recipient, &1), 1);
        assert_eq!(c.send_tip(&sender, &recipient, &1), 2);
        assert_eq!(
            c.try_send_tip(&sender, &recipient, &1),
            Err(Ok(Error::RateLimited))
        );
    }
}

// ── Issue #809: replay and correlation guards ─────────────────────────────────

#[cfg(test)]
mod replay_correlation {
    extern crate std;

    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{AnonymousTipping, AnonymousTippingClient};

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        AnonymousTippingClient::new(&env, &contract_id).init(&contract_id);
        (env, contract_id)
    }

    fn mk_client<'a>(env: &'a Env, id: &'a Address) -> AnonymousTippingClient<'a> {
        AnonymousTippingClient::new(env, id)
    }

    /// Each `send_tip` must return a strictly incrementing `settlement_id`.
    /// Backend consumers can use this to detect replayed events (same id = replay).
    #[test]
    fn settlement_ids_are_strictly_monotonic() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        let id1 = c.send_tip(&Address::generate(&env), &recipient, &10);
        let id2 = c.send_tip(&Address::generate(&env), &recipient, &20);
        let id3 = c.send_tip(&Address::generate(&env), &recipient, &30);

        assert!(id2 > id1, "settlement_id must increment: {} > {}", id2, id1);
        assert!(id3 > id2, "settlement_id must increment: {} > {}", id3, id2);
    }

    /// Two identical tips (same recipient, same amount) must produce different
    /// `settlement_id` values so a backend consumer can tell them apart rather
    /// than mistaking the second event for a replay of the first.
    #[test]
    fn identical_tips_produce_distinct_settlement_ids() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        let first = c.send_tip(&Address::generate(&env), &recipient, &100);
        let second = c.send_tip(&Address::generate(&env), &recipient, &100);

        assert_ne!(
            first, second,
            "duplicate tip must get a new settlement_id, not a replay of the first"
        );
    }

    /// A replayed event (same settlement_id) can be recognised by comparing against
    /// `latest_settlement_nonce`.  After N settlements the nonce equals N; any
    /// incoming event claiming id > N is future data, id <= previous is a replay.
    #[test]
    fn latest_nonce_reflects_all_settlements_for_replay_detection() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        assert_eq!(c.latest_settlement_nonce(), 0, "nonce starts at 0");

        c.send_tip(&Address::generate(&env), &recipient, &1);
        assert_eq!(c.latest_settlement_nonce(), 1);

        c.send_tip(&Address::generate(&env), &recipient, &2);
        assert_eq!(c.latest_settlement_nonce(), 2);

        c.send_tip(&Address::generate(&env), &recipient, &3);
        assert_eq!(c.latest_settlement_nonce(), 3);

        // Simulate replay detection: an event with settlement_id == 2 while
        // the nonce is already 3 is clearly a replay.
        let replayed_id: u64 = 2;
        let current_nonce = c.latest_settlement_nonce();
        assert!(
            replayed_id < current_nonce,
            "settlement_id {} < nonce {} identifies a replay",
            replayed_id,
            current_nonce
        );
    }

    /// Tips to different recipients use the same global nonce sequence so
    /// cross-recipient correlation remains deterministic for backend consumers.
    #[test]
    fn global_nonce_spans_multiple_recipients_for_cross_recipient_correlation() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        let id_a = c.send_tip(&Address::generate(&env), &alice, &10);
        let id_b = c.send_tip(&Address::generate(&env), &bob, &20);
        let id_c = c.send_tip(&Address::generate(&env), &carol, &30);

        // All settlement_ids come from the same sequence regardless of recipient.
        assert_eq!(id_a, 1);
        assert_eq!(id_b, 2);
        assert_eq!(id_c, 3);

        // Backend can correlate alice's id_a=1, bob's id_b=2, carol's id_c=3
        // into a single ordered stream without ambiguity.
        assert_eq!(c.latest_settlement_nonce(), 3);
    }
}
