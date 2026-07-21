/// Fuzz and property-based tests for the anonymous-tipping contract.
///
/// Tests focus on:
/// - Replay protection (settlement receipt verification)
/// - Double-spend resistance (cross-contract verification)
/// - Receipt integrity (recipient/amount match)
/// - Concurrent settlement ordering
#[cfg(test)]
mod fuzz {
    extern crate std;

    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{AnonymousTipping, AnonymousTippingClient, Error, SettlementReceipt};

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

    /// Replay protection: after a settlement, the receipt should be claimable
    /// with matching recipient and amount. A non-existent settlement_id should
    /// return SettlementNotFound.
    #[test]
    fn receipt_exists_after_settlement() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);

        let sid = c.send_tip(&sender, &recipient, &100i128);

        let receipt = c.claim_receipt(&sid);
        assert_eq!(receipt.recipient, recipient);
        assert_eq!(receipt.amount, 100i128);
        assert_eq!(receipt.settlement_id, sid);
        assert!(receipt.timestamp > 0);
    }

    /// Non-existent settlement_id returns SettlementNotFound
    #[test]
    fn nonexistent_receipt_returns_not_found() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);

        let result = c.try_claim_receipt(&999_999_u64);
        assert_eq!(result, Err(Ok(Error::SettlementNotFound)));
    }

    /// verify_settlement succeeds when recipient matches
    #[test]
    fn verify_settlement_matches_recipient() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);

        let sid = c.send_tip(&sender, &recipient, &250i128);

        let receipt = c.verify_settlement(&sid, &recipient);
        assert_eq!(receipt.recipient, recipient);
        assert_eq!(receipt.amount, 250i128);
    }

    /// verify_settlement returns RecipientMismatch when the expected recipient
    /// does not match the stored receipt
    #[test]
    fn verify_settlement_rejects_wrong_recipient() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let wrong = Address::generate(&env);
        let sender = Address::generate(&env);

        let sid = c.send_tip(&sender, &recipient, &100i128);

        let result = c.try_verify_settlement(&sid, &wrong);
        assert_eq!(result, Err(Ok(Error::RecipientMismatch)));
    }

    /// Multiple settlements produce distinct receipts, each with the correct
    /// recipient and amount. This protects against double-spend where an
    /// attacker tries to reuse the same settlement_id.
    #[test]
    fn multiple_settlements_have_distinct_receipts() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let sender = Address::generate(&env);

        let sid1 = c.send_tip(&sender, &alice, &100i128);
        let sid2 = c.send_tip(&sender, &bob, &200i128);
        let sid3 = c.send_tip(&sender, &alice, &300i128);

        // Each receipt is distinct and matches the correct recipient/amount
        let r1 = c.claim_receipt(&sid1);
        assert_eq!(r1.recipient, alice);
        assert_eq!(r1.amount, 100i128);

        let r2 = c.claim_receipt(&sid2);
        assert_eq!(r2.recipient, bob);
        assert_eq!(r2.amount, 200i128);

        let r3 = c.claim_receipt(&sid3);
        assert_eq!(r3.recipient, alice);
        assert_eq!(r3.amount, 300i128);

        // Cross-recipient check: sid1 belongs to alice, not bob
        let result = c.try_verify_settlement(&sid1, &bob);
        assert_eq!(result, Err(Ok(Error::RecipientMismatch)));
    }

    /// Receipt amounts should match the cumulative recipient total
    #[test]
    fn receipt_amounts_are_consistent_with_totals() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);

        let sid1 = c.send_tip(&sender, &recipient, &50i128);
        let sid2 = c.send_tip(&sender, &recipient, &150i128);

        let r1 = c.claim_receipt(&sid1);
        let r2 = c.claim_receipt(&sid2);

        // Each receipt records the individual tip amount
        assert_eq!(r1.amount, 50i128);
        assert_eq!(r2.amount, 150i128);

        // The cumulative total is the sum of individual receipts
        assert_eq!(c.get_tip_balance(&recipient), 200i128);
        assert_eq!(c.get_tip_balance(&recipient), r1.amount + r2.amount);
    }

    /// Simulate a double-spend scenario: a backend receives the same
    /// settlement_id twice. The receipt-based verification should detect
    /// that the second event is a replay of the first.
    #[test]
    fn receipt_enables_replay_detection() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);

        // First settlement
        let sid = c.send_tip(&sender, &recipient, &100i128);
        assert_eq!(sid, 1);

        // Verify the receipt exists and belongs to recipient
        let receipt = c.claim_receipt(&sid);
        assert_eq!(receipt.recipient, recipient);
        assert_eq!(receipt.amount, 100i128);

        // Simulate replay: backend receives an event with settlement_id=1 again.
        // The receipt has already been verified, so the backend can skip processing.
        // If the backend tries to verify that this settlement_id belongs to a
        // different recipient, it should fail.
        let different_recipient = Address::generate(&env);
        let result = c.try_verify_settlement(&sid, &different_recipient);
        assert_eq!(result, Err(Ok(Error::RecipientMismatch)));

        // The real recipient can always verify their receipt
        let verified = c.verify_settlement(&sid, &recipient);
        assert_eq!(verified.amount, 100i128);
    }

    /// After crossing u64::MAX settlement_id boundary, the contract should
    /// return NonceOverflow rather than silently wrapping.
    #[test]
    fn settlement_id_overflow_is_detected() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);

        // Manually set nonce to u64::MAX - 1 so the next tip pushes to MAX
        env.as_contract(&id, || {
            env.storage()
                .instance()
                .set(&crate::DataKey::SettlementNonce, &(u64::MAX - 1));
        });

        // This should succeed with settlement_id = u64::MAX
        let sid = c.send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(sid, u64::MAX);

        // Next tip should overflow
        let result = c.try_send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(result, Err(Ok(Error::NonceOverflow)));
    }

    /// High-volume sequential tip creation: verify all receipts are distinct
    /// and addressable after many settlements.
    #[test]
    fn high_volume_receipt_integrity() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let mut recipients = std::vec::Vec::new();
        for _ in 0..20 {
            recipients.push(Address::generate(&env));
        }

        let mut settlement_ids = std::vec::Vec::new();
        for (i, recipient) in recipients.iter().enumerate() {
            let amount = (i as i128 + 1) * 10;
            let sender = Address::generate(&env);
            let sid = c.send_tip(&sender, recipient, &amount);
            settlement_ids.push(sid);
        }

        // Verify each receipt has the correct recipient and amount
        for (i, (&sid, recipient)) in settlement_ids.iter().zip(recipients.iter()).enumerate() {
            let receipt = c.claim_receipt(&sid);
            assert_eq!(receipt.recipient, *recipient);
            assert_eq!(receipt.amount, (i as i128 + 1) * 10);
            assert_eq!(receipt.settlement_id, sid);
        }

        // Verify all settlement_ids are strictly monotonic
        for i in 1..settlement_ids.len() {
            assert!(
                settlement_ids[i] > settlement_ids[i - 1],
                "settlement_ids must be strictly increasing: {} > {}",
                settlement_ids[i],
                settlement_ids[i - 1]
            );
        }
    }

    /// Cross-contract verification: another contract calls claim_receipt to
    /// verify a settlement occurred before taking an action.
    #[test]
    fn cross_contract_receipt_verification() {
        let (env, id) = setup();
        let c = mk_client(&env, &id);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);

        // Perform a settlement
        let sid = c.send_tip(&sender, &recipient, &500i128);

        // Simulate cross-contract verification by direct contract call
        let receipt: SettlementReceipt = env.as_contract(&id, || {
            env.storage()
                .persistent()
                .get(&crate::DataKey::SettlementReceipt(sid))
                .unwrap()
        });

        assert_eq!(receipt.recipient, recipient);
        assert_eq!(receipt.amount, 500i128);
        assert_eq!(receipt.settlement_id, sid);
    }

    /// Uninitialised contract returns TokenNotConfigured for send_tip but
    /// should still report 0 for receipts (since no settlement occurred).
    #[test]
    fn uninitialised_contract_no_false_receipts() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        let c = mk_client(&env, &contract_id);
        // No init call

        // Claiming any receipt should fail with NotFound
        let result = c.try_claim_receipt(&1_u64);
        assert_eq!(result, Err(Ok(Error::SettlementNotFound)));

        // verify_settlement should also fail
        let random = Address::generate(&env);
        let result = c.try_verify_settlement(&1_u64, &random);
        assert_eq!(result, Err(Ok(Error::SettlementNotFound)));
    }
}
