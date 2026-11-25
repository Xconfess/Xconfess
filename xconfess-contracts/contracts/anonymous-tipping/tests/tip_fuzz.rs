use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient, Error};
use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn deploy(env: &Env) -> AnonymousTippingClient<'_> {
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(env, &id);
    client.initialize(&Address::generate(env), &id, &id);
    client
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 64,
        .. ProptestConfig::default()
    })]

    /// Re-run a failure with the seed and shrinking case printed by proptest;
    /// regression cases are stored under `proptest-regressions/` by proptest.
    #[test]
    fn generated_amounts_preserve_balance_invariants(amount: i128) {
        let env = Env::default();
        let client = deploy(&env);
        let recipient = Address::generate(&env);
        let sender = Address::generate(&env);
        let before = client.get_tip_balance(&recipient);

        let result = client.try_send_tip(&sender, &recipient, &amount);
        if (1..=AnonymousTipping::MAX_TIP_AMOUNT).contains(&amount) {
            prop_assert!(result.is_ok());
            prop_assert_eq!(client.get_tip_balance(&recipient), before + amount);
        } else {
            prop_assert_eq!(result, Err(Ok(Error::InvalidTipAmount)));
            prop_assert_eq!(client.get_tip_balance(&recipient), before);
        }
    }

    #[test]
    fn generated_recipient_choices_keep_balances_isolated(recipient_selector: u8, amount in 1_i128..=100_000_i128) {
        let env = Env::default();
        let client = deploy(&env);
        let recipients = [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];
        let recipient = &recipients[(recipient_selector as usize) % recipients.len()];

        client.send_tip(&Address::generate(&env), recipient, &amount);
        prop_assert_eq!(client.get_tips(recipient), amount);
        for other in recipients.iter().filter(|other| *other != recipient) {
            prop_assert_eq!(client.get_tips(other), 0);
        }
    }
}
