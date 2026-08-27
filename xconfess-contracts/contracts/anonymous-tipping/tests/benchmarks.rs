use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn benchmark_send_tip() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &contract_id);

    client.init(&contract_id);

    let recipient = Address::generate(&env);
    let amount = 100_i128;

    env.cost_estimate().budget().reset_default();
    let _ = client.send_tip(&Address::generate(&env), &recipient, &amount);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:send_tip:cpu:{}", cpu);
    println!("GAS_METRIC:send_tip:mem:{}", mem);
}

#[test]
fn benchmark_get_tips() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &contract_id);

    client.init(&contract_id);

    let recipient = Address::generate(&env);
    let amount = 100_i128;
    let _ = client.send_tip(&Address::generate(&env), &recipient, &amount);

    env.cost_estimate().budget().reset_default();
    let _ = client.get_tips(&recipient);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:get_tips:cpu:{}", cpu);
    println!("GAS_METRIC:get_tips:mem:{}", mem);
}
