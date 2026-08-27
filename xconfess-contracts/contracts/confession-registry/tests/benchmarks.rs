use confession_registry::{ConfessionRegistry, ConfessionRegistryClient, ConfessionStatus};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

fn setup(env: &Env) -> (ConfessionRegistryClient<'static>, Address, Address) {
    env.mock_all_auths();
    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let author = Address::generate(env);
    client.initialize(&admin);
    (client, admin, author)
}

#[test]
fn benchmark_create_confession() {
    let env = Env::default();
    let (client, _admin, author) = setup(&env);
    let hash = BytesN::from_array(&env, &[1; 32]);
    let ts: u64 = 1_000;

    env.cost_estimate().budget().reset_default();
    client.create_confession(&author, &hash, &ts);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:create_confession:cpu:{}", cpu);
    println!("GAS_METRIC:create_confession:mem:{}", mem);
}

#[test]
fn benchmark_update_status() {
    let env = Env::default();
    let (client, _admin, author) = setup(&env);
    let hash = BytesN::from_array(&env, &[1; 32]);
    let ts: u64 = 1_000;
    let id = client.create_confession(&author, &hash, &ts);

    env.cost_estimate().budget().reset_default();
    client.update_status(&author, &id, &ConfessionStatus::Flagged, &2_000);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:update_status:cpu:{}", cpu);
    println!("GAS_METRIC:update_status:mem:{}", mem);
}
