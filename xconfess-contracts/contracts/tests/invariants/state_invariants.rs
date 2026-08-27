use soroban_sdk::{Env};

pub fn assert_invariants(env: &Env) {
    let total_confessions = crate::contract::get_total_confessions(env);
    let resolved_confessions = crate::contract::get_resolved_confessions(env);
    let total_reports = crate::contract::get_total_reports(env);
    let resolved_reports = crate::contract::get_resolved_reports(env);

    // 🔒 Counter invariants
    assert!(total_confessions >= resolved_confessions);
    assert!(total_reports >= resolved_reports);

    // Ensure no negative counters
    assert!(total_confessions >= 0);
    assert!(total_reports >= 0);

    // 📡 Event sanity check
    let events = env.events().all();
    for (_, event) in events {
        let topic = event.topics.get(0).unwrap();
        assert!(
            topic == "create"
                || topic == "react"
                || topic == "report"
                || topic == "resolve",
            "Unknown event type emitted"
        );
    }
}