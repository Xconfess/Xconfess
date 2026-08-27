use soroban_sdk::{Env, Symbol};
use xconfess_contract::events::emit_event_with_correlation;

#[derive(serde::Serialize)]
struct TestPayload {
    msg: &'static str,
}

#[test]
fn test_emit_event_without_correlation() {
    let env = Env::default();
    let payload = TestPayload { msg: "hello" };

    emit_event_with_correlation(&env, "TestEvent", &payload, None);

    let events: Vec<_> = env.events().all().collect();
    assert_eq!(events.len(), 1);
    let (_, payload_vec) = &events[0];
    assert_eq!(payload_vec.len(), 1); // only payload, no correlation
}

#[test]
fn test_emit_event_with_correlation() {
    let env = Env::default();
    let payload = TestPayload { msg: "hello" };
    let correlation_id = "req-1234";

    emit_event_with_correlation(&env, "TestEvent", &payload, Some(correlation_id));

    let events: Vec<_> = env.events().all().collect();
    assert_eq!(events.len(), 1);
    let (_, payload_vec) = &events[0];
    assert!(payload_vec.len() > 1); // payload + correlation
}