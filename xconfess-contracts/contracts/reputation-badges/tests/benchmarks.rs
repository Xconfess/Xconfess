use reputation_badges::{BadgeType, ReputationBadges, ReputationBadgesClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (ReputationBadgesClient<'static>, Address) {
    env.mock_all_auths();
    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(env, &contract_id);
    let user = Address::generate(env);
    (client, user)
}

#[test]
fn benchmark_mint_badge() {
    let env = Env::default();
    let (client, user) = setup(&env);

    env.cost_estimate().budget().reset_default();
    let _ = client.mint_badge(&user, &BadgeType::ConfessionStarter);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:mint_badge:cpu:{}", cpu);
    println!("GAS_METRIC:mint_badge:mem:{}", mem);
}

#[test]
fn benchmark_get_badges() {
    let env = Env::default();
    let (client, user) = setup(&env);
    let _ = client.mint_badge(&user, &BadgeType::ConfessionStarter);

    env.cost_estimate().budget().reset_default();
    let _ = client.get_badges(&user);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    println!("GAS_METRIC:get_badges:cpu:{}", cpu);
    println!("GAS_METRIC:get_badges:mem:{}", mem);
}
