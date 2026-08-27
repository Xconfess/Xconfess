use soroban_sdk::{Env, testutils::Budget};

use xconfess_contract::{XConfessContract, XConfessContractClient};

#[test]
fn snapshot_gas_usage() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(XConfessContract, ());
    let client = XConfessContractClient::new(&env, &contract_id);

    let mut report = serde_json::json!({});

    // CREATE
    env.budget().reset_unlimited();
    client.create(&"hello".into());
    let create_cpu = env.budget().cpu_instruction_cost();
    report["create"] = create_cpu.into();

    // REACT
    env.budget().reset_unlimited();
    client.react(&1, &1);
    let react_cpu = env.budget().cpu_instruction_cost();
    report["react"] = react_cpu.into();

    // REPORT
    env.budget().reset_unlimited();
    client.report(&1, &"spam".into());
    let report_cpu = env.budget().cpu_instruction_cost();
    report["report"] = report_cpu.into();

    // RESOLVE
    env.budget().reset_unlimited();
    client.resolve(&1);
    let resolve_cpu = env.budget().cpu_instruction_cost();
    report["resolve"] = resolve_cpu.into();

    std::fs::write(
        "gas-current.json",
        serde_json::to_string_pretty(&report).unwrap(),
    )
    .unwrap();
}
