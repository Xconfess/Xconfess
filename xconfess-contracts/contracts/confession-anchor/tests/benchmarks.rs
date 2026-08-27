use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use soroban_sdk::{BytesN, Env};

#[test]
fn benchmark_anchor_confession() {
    let env = Env::default();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let hash = BytesN::from_array(&env, &[1; 32]);
    let ts: u64 = 1_700_000_000_000;

    env.cost_estimate().budget().reset_default();
    client.anchor_confession(&hash, &ts);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:anchor_confession:cpu:{}", cpu);
    println!("GAS_METRIC:anchor_confession:mem:{}", mem);
}

#[test]
fn benchmark_verify_confession() {
    let env = Env::default();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let hash = BytesN::from_array(&env, &[1; 32]);
    let ts: u64 = 1_700_000_000_000;

    client.anchor_confession(&hash, &ts);

    env.cost_estimate().budget().reset_default();
    client.verify_confession(&hash);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:verify_confession:cpu:{}", cpu);
    println!("GAS_METRIC:verify_confession:mem:{}", mem);
}
