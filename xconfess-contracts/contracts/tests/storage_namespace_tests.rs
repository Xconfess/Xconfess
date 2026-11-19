use soroban_sdk::{Env, Symbol, symbol};

#[test]
fn test_storage_key_namespace_isolation() {
    let env = Env::default();
    env.mock_all_auths();

    // Test that different contract data domains do not collide in storage
    // Each domain should have a unique key prefix

    let storage = env.storage().instance();

    // Domain 1: Reports
    let report_key_1 = symbol!("report_1");
    let report_value = "report_value_1".to_string();
    storage.set(&report_key_1, &report_value);

    // Domain 2: Events
    let event_key_1 = symbol!("event_1");
    let event_value = "event_value_1".to_string();
    storage.set(&event_key_1, &event_value);

    // Domain 3: Reputation
    let rep_key_1 = symbol!("reputation_1");
    let rep_value = 100u32;
    storage.set(&rep_key_1, &rep_value);

    // Verify isolation: reading one domain should not return another's data
    let retrieved_report: String = storage.get(&report_key_1).unwrap();
    assert_eq!(retrieved_report, report_value, "Report value should match");

    let retrieved_event: String = storage.get(&event_key_1).unwrap();
    assert_eq!(retrieved_event, event_value, "Event value should match");

    let retrieved_rep: u32 = storage.get(&rep_key_1).unwrap();
    assert_eq!(retrieved_rep, rep_value, "Reputation value should match");

    // Verify no cross-contamination
    let wrong_key = symbol!("nonexistent");
    let result: Option<String> = storage.get(&wrong_key);
    assert!(result.is_none(), "Non-existent key should not exist");
}

#[test]
fn test_storage_key_prefix_uniqueness() {
    let env = Env::default();
    env.mock_all_auths();

    let storage = env.storage().instance();

    // Document key prefixes used by the system
    let prefixes = vec![
        ("report", symbol!("report_data")),
        ("event", symbol!("event_log")),
        ("reputation", symbol!("rep_score")),
        ("settlement", symbol!("settlement_receipt")),
    ];

    // Store values with each prefix
    for (domain, key) in &prefixes {
        let value = format!("value_{}", domain);
        storage.set(key, &value);
    }

    // Verify each key retrieves only its own value
    for (domain, key) in &prefixes {
        let expected = format!("value_{}", domain);
        let retrieved: String = storage.get(key).unwrap();
        assert_eq!(retrieved, expected, "Key {} should only retrieve its own value", domain);
    }
}

#[test]
fn test_independent_state_updates() {
    let env = Env::default();
    env.mock_all_auths();

    let storage = env.storage().instance();

    // Test that updating one domain does not affect another
    let report_key = symbol!("report_counter");
    let event_key = symbol!("event_counter");

    // Initialize both
    storage.set(&report_key, &0u64);
    storage.set(&event_key, &0u64);

    // Update reports
    storage.set(&report_key, &10u64);

    // Verify events unchanged
    let event_count: u64 = storage.get(&event_key).unwrap();
    assert_eq!(event_count, 0, "Event counter should remain unchanged");

    // Update events
    storage.set(&event_key, &20u64);

    // Verify reports unchanged
    let report_count: u64 = storage.get(&report_key).unwrap();
    assert_eq!(report_count, 10, "Report counter should remain unchanged");
}

#[test]
fn test_deployed_storage_compatibility() {
    let env = Env::default();
    env.mock_all_auths();

    let storage = env.storage().instance();

    // Test that storage format remains compatible across versions
    // Simulate pre-existing storage from previous deployment

    // v1 style keys (if any exist)
    let v1_key = symbol!("v1_data");
    storage.set(&v1_key, &"legacy_value".to_string());

    // v2+ can read v1 keys without breaking
    let legacy: String = storage.get(&v1_key).unwrap();
    assert_eq!(legacy, "legacy_value", "Legacy keys should be readable");

    // New keys don't interfere
    let new_key = symbol!("v2_data");
    storage.set(&new_key, &"new_value".to_string());

    // Legacy key is unchanged
    let legacy_recheck: String = storage.get(&v1_key).unwrap();
    assert_eq!(legacy_recheck, "legacy_value", "Legacy key should remain unchanged");
}

#[test]
fn test_namespace_collision_prevention() {
    let env = Env::default();
    env.mock_all_auths();

    let storage = env.storage().instance();

    // Test that similar key names don't collide
    let key_a = symbol!("report");
    let key_b = symbol!("report_1");
    let key_c = symbol!("report_metadata");

    storage.set(&key_a, &"value_a");
    storage.set(&key_b, &"value_b");
    storage.set(&key_c, &"value_c");

    // Each key should retrieve its own value
    let val_a: String = storage.get(&key_a).unwrap();
    let val_b: String = storage.get(&key_b).unwrap();
    let val_c: String = storage.get(&key_c).unwrap();

    assert_eq!(val_a, "value_a");
    assert_eq!(val_b, "value_b");
    assert_eq!(val_c, "value_c");
    assert_ne!(val_a, val_b);
    assert_ne!(val_b, val_c);
}

#[test]
fn test_persistent_vs_instance_storage_isolation() {
    let env = Env::default();
    env.mock_all_auths();

    let instance = env.storage().instance();
    let persistent = env.storage().persistent();

    // Test that instance and persistent storage are isolated
    let key = symbol!("shared_key");

    // Write to instance storage
    instance.set(&key, &"instance_value");

    // Write to persistent storage with same key
    persistent.set(&key, &"persistent_value");

    // Verify isolation
    let instance_val: String = instance.get(&key).unwrap();
    let persistent_val: String = persistent.get(&key).unwrap();

    assert_eq!(instance_val, "instance_value");
    assert_eq!(persistent_val, "persistent_value");
}

#[test]
fn test_concurrent_domain_operations() {
    let env = Env::default();
    env.mock_all_auths();

    let storage = env.storage().instance();

    // Simulate concurrent operations on different domains
    // (sequential in test, but verifies each domain state correctly)

    let domain_1_keys: Vec<_> = (0..5)
        .map(|i| (symbol!("domain_1"), i))
        .collect();
    let domain_2_keys: Vec<_> = (0..5)
        .map(|i| (symbol!("domain_2"), i))
        .collect();

    // Interleave writes
    for i in 0..5 {
        // Write domain 1
        let key = symbol!("d1_key");
        storage.set(&key, &format!("d1_value_{}", i));

        // Write domain 2
        let key = symbol!("d2_key");
        storage.set(&key, &format!("d2_value_{}", i));
    }

    // Verify final state
    let final_d1: String = storage.get(&symbol!("d1_key")).unwrap();
    let final_d2: String = storage.get(&symbol!("d2_key")).unwrap();

    assert_eq!(final_d1, "d1_value_4");
    assert_eq!(final_d2, "d2_value_4");
}

#[test]
fn test_storage_key_length_does_not_collide() {
    let env = Env::default();
    env.mock_all_auths();

    let storage = env.storage().instance();

    // Keys of different lengths should not collide
    let short_key = symbol!("short");
    let long_key = symbol!("this_is_a_much_longer_key_name");

    storage.set(&short_key, &"short_val");
    storage.set(&long_key, &"long_val");

    let retrieved_short: String = storage.get(&short_key).unwrap();
    let retrieved_long: String = storage.get(&long_key).unwrap();

    assert_eq!(retrieved_short, "short_val");
    assert_eq!(retrieved_long, "long_val");
}
