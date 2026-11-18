extern crate std;

use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::Address as _, Address, Env, MuxedAddress,
};

use crate::{AnonymousTipping, AnonymousTippingClient, Error};

#[contract]
pub struct TestToken;

#[contracttype]
#[derive(Clone)]
enum TokenKey {
    Balance(Address),
}

#[contractimpl]
impl TestToken {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&TokenKey::Balance(to), &(balance + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get::<_, i128>(&TokenKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        let to = to.address();
        let from_balance = Self::balance(env.clone(), from.clone());
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&TokenKey::Balance(from), &(from_balance - amount));
        env.storage()
            .persistent()
            .set(&TokenKey::Balance(to), &(to_balance + amount));
    }
}

fn setup() -> (Env, AnonymousTippingClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let token_id = env.register(TestToken, ());
    let contract_id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &contract_id);
    client.init(&token_id);
    (env, client, token_id)
}

#[test]
fn send_tip_transfers_xlm_and_records_balance() {
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender, &1_000);

    let settlement_id = client.send_tip(&sender, &recipient, &125);

    assert_eq!(settlement_id, 1);
    assert_eq!(token.balance(&sender), 875);
    assert_eq!(token.balance(&recipient), 125);
    assert_eq!(client.get_tip_balance(&recipient), 125);
}

#[test]
fn get_tip_balance_returns_cumulative_total() {
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender, &1_000);

    client.send_tip(&sender, &recipient, &100);
    client.send_tip(&sender, &recipient, &250);

    assert_eq!(client.get_tip_balance(&recipient), 350);
    assert_eq!(token.balance(&recipient), 350);
}

#[test]
fn invalid_tip_amounts_do_not_affect_valid_tips() {
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender, &1);

    for amount in [0_i128, -1_i128, AnonymousTipping::MAX_TIP_AMOUNT + 1] {
        assert_eq!(
            client.try_send_tip(&sender, &recipient, &amount),
            Err(Ok(Error::InvalidTipAmount))
        );
    }

    assert_eq!(token.balance(&sender), 1);
    assert_eq!(client.get_tip_balance(&recipient), 0);

    let settlement_id = client.send_tip(&sender, &recipient, &1);
    assert_eq!(settlement_id, 1);
    assert_eq!(token.balance(&sender), 0);
    assert_eq!(client.get_tip_balance(&recipient), 1);
}

#[test]
fn non_positive_amounts_return_contract_error() {
    let (env, client, _token_id) = setup();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    assert_eq!(
        client.try_send_tip(&sender, &recipient, &0),
        Err(Ok(Error::InvalidTipAmount))
    );
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &-1),
        Err(Ok(Error::InvalidTipAmount))
    );
    assert_eq!(client.get_tip_balance(&recipient), 0);
}

#[test]
fn overflow_amount_returns_contract_error() {
    let (env, client, _token_id) = setup();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Amount exceeding MAX_TIP_AMOUNT (10,000 XLM = 100_000_000_000 stroops)
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &(AnonymousTipping::MAX_TIP_AMOUNT + 1)),
        Err(Ok(Error::InvalidTipAmount))
    );
    // i128::MAX should also be rejected
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &i128::MAX),
        Err(Ok(Error::InvalidTipAmount))
    );
    assert_eq!(client.get_tip_balance(&recipient), 0);
}

#[test]
fn boundary_amounts_are_accepted() {
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Minimum valid amount (1 stroop)
    token.mint(&sender, &1);
    let id = client.send_tip(&sender, &recipient, &1);
    assert_eq!(id, 1);
    assert_eq!(client.get_tip_balance(&recipient), 1);

    // Maximum valid amount (10,000 XLM)
    let max_amount = AnonymousTipping::MAX_TIP_AMOUNT;
    token.mint(&sender, &max_amount);
    let id2 = client.send_tip(&sender, &recipient, &max_amount);
    assert_eq!(id2, 2);
    assert_eq!(client.get_tip_balance(&recipient), 1 + max_amount);
}

// ── #1665 boundary / overflow regression tests ────────────────────────────────

#[test]
fn i128_min_is_rejected() {
    // i128::MIN is negative — must be rejected as InvalidTipAmount, not panic.
    let (env, client, _token_id) = setup();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &i128::MIN),
        Err(Ok(Error::InvalidTipAmount))
    );
    assert_eq!(client.get_tip_balance(&recipient), 0);
}

#[test]
fn one_below_max_is_accepted_and_one_above_max_is_rejected() {
    // MAX_TIP_AMOUNT - 1: last valid amount before the ceiling.
    // MAX_TIP_AMOUNT + 1: first invalid amount above the ceiling.
    // Verifies the boundary is inclusive on the correct side.
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let below_max = AnonymousTipping::MAX_TIP_AMOUNT - 1;
    token.mint(&sender, &below_max);
    let id = client.send_tip(&sender, &recipient, &below_max);
    assert_eq!(id, 1);
    assert_eq!(client.get_tip_balance(&recipient), below_max);

    assert_eq!(
        client.try_send_tip(&sender, &recipient, &(AnonymousTipping::MAX_TIP_AMOUNT + 1)),
        Err(Ok(Error::InvalidTipAmount))
    );
}

#[test]
fn settlement_id_is_monotonically_increasing_across_senders() {
    // Each successful tip increments the global settlement counter regardless
    // of which sender/recipient pair is involved.
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender_a = Address::generate(&env);
    let sender_b = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender_a, &500);
    token.mint(&sender_b, &500);

    let id1 = client.send_tip(&sender_a, &recipient, &100);
    let id2 = client.send_tip(&sender_b, &recipient, &200);
    let id3 = client.send_tip(&sender_a, &recipient, &50);

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);
    assert_eq!(client.get_tip_balance(&recipient), 350);
}

#[test]
fn duplicate_tips_both_succeed_separately() {
    // Two identical tips from the same sender to the same recipient
    // should each succeed and both be recorded (separate settlements).
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender, &500);

    let id1 = client.send_tip(&sender, &recipient, &100);
    let id2 = client.send_tip(&sender, &recipient, &100);

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.get_tip_balance(&recipient), 200);
    assert_eq!(token.balance(&sender), 300);
    assert_eq!(token.balance(&recipient), 200);
}

#[test]
fn insufficient_balance_rejects_tip() {
    // Sender with insufficient balance should have transfer fail.
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Mint 50, try to send 100 — should fail
    token.mint(&sender, &50);

    // This should fail because token.transfer will fail due to insufficient balance
    let result = client.try_send_tip(&sender, &recipient, &100);
    assert!(result.is_err());
    assert_eq!(client.get_tip_balance(&recipient), 0);
    assert_eq!(token.balance(&sender), 50);
}

#[test]
fn zero_balance_sender_cannot_tip() {
    // A sender with zero balance cannot send any tip.
    let (env, client, _token_id) = setup();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let result = client.try_send_tip(&sender, &recipient, &1);
    assert!(result.is_err());
    assert_eq!(client.get_tip_balance(&recipient), 0);
}

#[test]
fn multiple_tips_accumulate_correctly() {
    // Test that multiple tips to the same recipient accumulate and
    // settlement IDs remain monotonic across many operations.
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender1 = Address::generate(&env);
    let sender2 = Address::generate(&env);
    let sender3 = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender1, &1000);
    token.mint(&sender2, &1000);
    token.mint(&sender3, &1000);

    // Multiple tips from different senders
    let id1 = client.send_tip(&sender1, &recipient, &100);
    let id2 = client.send_tip(&sender2, &recipient, &150);
    let id3 = client.send_tip(&sender3, &recipient, &75);
    let id4 = client.send_tip(&sender1, &recipient, &50);
    let id5 = client.send_tip(&sender2, &recipient, &25);

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);
    assert_eq!(id4, 4);
    assert_eq!(id5, 5);

    assert_eq!(client.get_tip_balance(&recipient), 400);
    assert_eq!(token.balance(&sender1), 850);
    assert_eq!(token.balance(&sender2), 825);
    assert_eq!(token.balance(&sender3), 925);
    assert_eq!(token.balance(&recipient), 400);
}

#[test]
fn tip_balance_reflects_total_received() {
    // Verify that get_tip_balance returns cumulative amount from all senders.
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender, &1000);

    // Check balance progression
    assert_eq!(client.get_tip_balance(&recipient), 0);

    client.send_tip(&sender, &recipient, &100);
    assert_eq!(client.get_tip_balance(&recipient), 100);

    client.send_tip(&sender, &recipient, &250);
    assert_eq!(client.get_tip_balance(&recipient), 350);

    client.send_tip(&sender, &recipient, &150);
    assert_eq!(client.get_tip_balance(&recipient), 500);
}

#[test]
fn single_stroop_transfer_succeeds() {
    // Edge case: minimum valid amount should work.
    let (env, client, token_id) = setup();
    let token = TestTokenClient::new(&env, &token_id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    token.mint(&sender, &1);
    let id = client.send_tip(&sender, &recipient, &1);

    assert_eq!(id, 1);
    assert_eq!(client.get_tip_balance(&recipient), 1);
    assert_eq!(token.balance(&sender), 0);
    assert_eq!(token.balance(&recipient), 1);
}
