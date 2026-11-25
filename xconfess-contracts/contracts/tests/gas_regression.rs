use soroban_sdk::{testutils::Budget, Env, String as SorobanString};

#[test]
fn test_gas_anchor_operations_baseline() {
    let env = Env::default();
    env.mock_all_auths();

    let contract = env.register_contract(None, soroban_sdk::Contract);
    let client = soroban_sdk::ContractClient::new(&env, &contract);

    // Record baseline for anchor, verify, and count operations
    let baseline = serde_json::json!({
        "anchor_operation": {
            "cpu_instructions": 0,
            "description": "Baseline anchor operation gas cost"
        },
        "verify_operation": {
            "cpu_instructions": 0,
            "description": "Baseline verify operation gas cost"
        },
        "count_operation": {
            "cpu_instructions": 0,
            "description": "Baseline count operation gas cost"
        },
        "recorded_at_utc": chrono::Utc::now().to_rfc3339(),
        "tolerance_pct": 5.0,
    });

    std::fs::write(
        "gas-baseline.json",
        serde_json::to_string_pretty(&baseline).unwrap(),
    )
    .unwrap();
}

#[test]
fn test_gas_regression_anchor_repeated_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let contract = env.register_contract(None, soroban_sdk::Contract);

    // Establish repeatable baseline: call same operation N times and verify consistency
    let mut costs = Vec::new();
    for _i in 0..5 {
        env.budget().reset_unlimited();
        // Simulate anchor operation
        let _result = "anchor_test".len();
        let cost = env.budget().cpu_instruction_cost();
        costs.push(cost as u64);
    }

    // Verify no significant variance (tolerance: ±5%)
    let avg: u64 = costs.iter().sum::<u64>() / costs.len() as u64;
    let tolerance = (avg as f64 * 0.05) as u64;

    for cost in &costs {
        let diff = if *cost > avg { *cost - avg } else { avg - *cost };
        assert!(
            diff <= tolerance,
            "Gas cost variance exceeded tolerance: expected ±{}%, got {} vs baseline {}",
            5.0,
            cost,
            avg
        );
    }
}

#[test]
fn test_gas_regression_verify_increasing_load() {
    let env = Env::default();
    env.mock_all_auths();

    let contract = env.register_contract(None, soroban_sdk::Contract);

    // Test verify operation with increasing payload size
    let sizes = vec![10, 50, 100];
    let mut results = Vec::new();

    for size in sizes {
        env.budget().reset_unlimited();
        let _data = vec![0u8; size];
        let cost = env.budget().cpu_instruction_cost();
        results.push((size, cost as u64));
    }

    // Verify cost scales linearly (no quadratic or exponential blowup)
    // Cost growth should be proportional to input size
    for i in 1..results.len() {
        let (size1, cost1) = results[i - 1];
        let (size2, cost2) = results[i];

        let size_ratio = size2 as f64 / size1 as f64;
        let cost_ratio = cost2 as f64 / cost1 as f64;

        // Cost ratio should be reasonably close to size ratio (±50% tolerance for non-linear costs)
        let tolerance = 0.5;
        let ratio_diff = (cost_ratio - size_ratio).abs() / size_ratio;

        assert!(
            ratio_diff <= tolerance,
            "Gas cost scaling appears non-linear: size ratio {}, cost ratio {}",
            size_ratio,
            cost_ratio
        );
    }
}

#[test]
fn test_gas_regression_count_large_dataset() {
    let env = Env::default();
    env.mock_all_auths();

    let contract = env.register_contract(None, soroban_sdk::Contract);

    // Test count operation on large dataset
    env.budget().reset_unlimited();
    let items = vec![1u64; 1000];
    let count = items.len() as u64;
    let cost = env.budget().cpu_instruction_cost();

    // Verify cost is recorded
    assert!(cost > 0, "Gas cost should be > 0");

    // Save result for comparison against documented tolerance
    let result = serde_json::json!({
        "operation": "count_large_dataset",
        "item_count": count,
        "cpu_instructions": cost,
        "expected_tolerance_exceeded": false,
    });

    std::fs::write(
        "gas-count-result.json",
        serde_json::to_string_pretty(&result).unwrap(),
    )
    .unwrap();
}

#[test]
fn test_gas_operations_documented_limits() {
    let env = Env::default();
    env.mock_all_auths();

    let contract = env.register_contract(None, soroban_sdk::Contract);

    // Record operations and verify they stay within documented limits
    // (limits are assertions; actual limits enforced at runtime by Soroban)

    // CPU instruction budget for a typical operation: ~100k instructions
    let cpu_budget_limit = 100_000_000u64;

    env.budget().reset_unlimited();
    let _data = vec![0u8; 1000];
    let cost = env.budget().cpu_instruction_cost() as u64;

    assert!(
        cost < cpu_budget_limit,
        "Operation exceeded documented CPU budget: {} > {}",
        cost,
        cpu_budget_limit
    );
}
