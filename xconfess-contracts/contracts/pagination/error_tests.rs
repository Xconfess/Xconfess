#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, String};
 
    // ── Helpers ───────────────────────────────────────────────────────────────
 
    fn make_env() -> Env {
        Env::default()
    }
 
    /// Build a `soroban_sdk::String` of exactly `n` ASCII 'a' characters.
    fn make_string(env: &Env, n: u32) -> String {
        // soroban_sdk::String::from_str requires a &str literal; we build one
        // by repeating a fixed-size slice and then converting via bytes.
        let byte = b'a';
        let mut buf = soroban_sdk::Vec::new(env);
        for _ in 0..n {
            buf.push_back(byte);
        }
        String::from_bytes(env, &soroban_sdk::Bytes::from_slice(env, &vec![byte; n as usize]))
    }
 
    // ── Empty content ─────────────────────────────────────────────────────────
 
    #[test]
    fn empty_content_returns_content_empty_error() {
        let env = make_env();
        let content = String::from_str(&env, "");
        let result = create(&env, content);
        assert_eq!(result, Err(ConfessionError::ContentEmpty));
    }
 
    #[test]
    fn empty_content_does_not_panic() {
        // Redundant with the assert above but makes the intent explicit:
        // the function must return, not unwind.
        let env = make_env();
        let result = std::panic::catch_unwind(|| {
            // We can't call create() across the catch_unwind boundary directly
            // because Env is not UnwindSafe, so we verify via the Ok/Err path.
        });
        let _ = result; // catch_unwind not needed here; just assert no panic above
        let content = String::from_str(&env, "");
        assert!(create(&env, content).is_err());
    }
 
    // ── Content-too-long boundaries ───────────────────────────────────────────
 
    #[test]
    fn content_at_max_length_succeeds() {
        let env = make_env();
        // Exactly MAX_CONFESSION_CONTENT_LEN chars must be accepted
        let content = make_string(&env, MAX_CONFESSION_CONTENT_LEN);
        let result = create(&env, content);
        assert!(
            result.is_ok(),
            "expected Ok for content of length {MAX_CONFESSION_CONTENT_LEN}, got {result:?}"
        );
    }
 
    #[test]
    fn content_one_over_max_returns_content_too_long_error() {
        let env = make_env();
        let content = make_string(&env, MAX_CONFESSION_CONTENT_LEN + 1);
        let result = create(&env, content);
        assert_eq!(result, Err(ConfessionError::ContentTooLong));
    }
 
    #[test]
    fn content_well_over_max_returns_content_too_long_error() {
        let env = make_env();
        let content = make_string(&env, MAX_CONFESSION_CONTENT_LEN + 100);
        let result = create(&env, content);
        assert_eq!(result, Err(ConfessionError::ContentTooLong));
    }
 
    // ── Happy-path ────────────────────────────────────────────────────────────
 
    #[test]
    fn single_char_content_succeeds_and_returns_id_1() {
        let env = make_env();
        let content = String::from_str(&env, "x");
        let id = create(&env, content).expect("single char should succeed");
        assert_eq!(id, 1);
    }
 
    #[test]
    fn successive_confessions_increment_id() {
        let env = make_env();
        let id1 = create(&env, String::from_str(&env, "first")).unwrap();
        let id2 = create(&env, String::from_str(&env, "second")).unwrap();
        let id3 = create(&env, String::from_str(&env, "third")).unwrap();
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(id3, 3);
    }
 
    #[test]
    fn confession_is_stored_and_retrievable() {
        let env = make_env();
        let content = String::from_str(&env, "my secret");
        let id = create(&env, content.clone()).unwrap();
 
        let stored: Confession = env
            .storage()
            .instance()
            .get(&ConfessionKey::Registry(id))
            .expect("confession should be in storage");
 
        assert_eq!(stored.id, id);
        assert_eq!(stored.content, content);
    }
 
    #[test]
    fn index_key_is_written_on_creation() {
        let env = make_env();
        let id = create(&env, String::from_str(&env, "indexed")).unwrap();
        let created_seq = env.ledger().sequence() as u64;
 
        let indexed_id: u64 = env
            .storage()
            .instance()
            .get(&ConfessionKey::Index((created_seq, id)))
            .expect("index entry should exist");
 
        assert_eq!(indexed_id, id);
    }
 
    #[test]
    fn counter_reflects_total_confessions() {
        let env = make_env();
        create(&env, String::from_str(&env, "one")).unwrap();
        create(&env, String::from_str(&env, "two")).unwrap();
        create(&env, String::from_str(&env, "three")).unwrap();
 
        let counter: u64 = env
            .storage()
            .instance()
            .get(&ConfessionKey::Counter)
            .expect("counter should be set");
 
        assert_eq!(counter, 3);
    }
 
    // ── Error discriminant values ─────────────────────────────────────────────
    // These pin the wire values so a change to the enum numbering is caught.
 
    #[test]
    fn error_discriminants_are_stable() {
        assert_eq!(ConfessionError::ContentEmpty as u32, 1);
        assert_eq!(ConfessionError::ContentTooLong as u32, 2);
    }
}