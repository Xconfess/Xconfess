use super::actions::Action;

#[derive(Clone, Debug)]
pub struct Lcg {
    state: u64,
}

impl Lcg {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u32(&mut self) -> u32 {
        // Deterministic LCG; stable across platforms.
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (self.state >> 32) as u32
    }

    fn bounded(&mut self, max_exclusive: u32) -> u32 {
        if max_exclusive == 0 {
            0
        } else {
            self.next_u32() % max_exclusive
        }
    }

    #[allow(dead_code)]
    fn next_i128_nonzero(&mut self) -> i128 {
        // Produce a nonzero signed value using two LCG words.
        let hi = self.next_u32() as i128;
        let lo = self.next_u32() as i128;
        let v = (hi << 32) | lo;
        if v == 0 {
            1
        } else {
            v
        }
    }
}

pub fn generate_actions(seed: u64, steps: usize) -> Vec<Action> {
    let mut rng = Lcg::new(seed);
    let mut actions = Vec::with_capacity(steps);
    let mut max_conf_id_seen = 0_u32;

    for _ in 0..steps {
        let pick = rng.bounded(5);
        let actor = rng.bounded(6);
        let confession_id = rng.bounded(max_conf_id_seen.saturating_add(3));

        let action = match pick {
            0 => {
                max_conf_id_seen = max_conf_id_seen.saturating_add(1);
                Action::Create { actor }
            }
            1 => Action::React {
                actor,
                confession_id,
            },
            2 => Action::Report {
                actor,
                confession_id,
                reason_len: rng.bounded(160),
            },
            3 => Action::Resolve {
                admin: rng.bounded(3),
                confession_id,
            },
            _ => Action::Escalate {
                admin: rng.bounded(3),
                confession_id,
            },
        };

        actions.push(action);
    }

    actions
}

// ── Tipping action generator ──────────────────────────────────────────────────
//
// `TipAction` models three classes of input that the tipping contract must handle:
//   Valid    – a well-formed tip (positive amount, metadata within bounds)
//   BadAmt   – an invalid amount (zero or negative) that must panic
//   BigMeta  – an oversized metadata payload that must panic
//
// `generate_tip_actions` produces a deterministic, seed-reproducible sequence
// using the same LCG so results are stable across test runs and platforms.

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TipAction {
    /// A fully valid tip — recipient index into a pre-built address pool.
    Valid {
        recipient_idx: u32,
        amount: i128,
        /// metadata byte length; 0..=128 inclusive.
        meta_len: u32,
    },
    /// An invalid amount (<= 0). Contract must panic("tip amount must be positive").
    BadAmt {
        recipient_idx: u32,
        /// Always <= 0.
        amount: i128,
    },
    /// Metadata exceeds the 128-byte cap. Contract must panic("proof metadata too long").
    BigMeta {
        recipient_idx: u32,
        /// Always > 128.
        meta_len: u32,
    },
}

/// Generate a deterministic sequence of `TipAction`s.
///
/// * `seed`   – LCG seed; same seed ⟹ same sequence.
/// * `steps`  – number of actions to produce.
/// * `pool`   – number of distinct recipient slots available (must be >= 1).
pub fn generate_tip_actions(seed: u64, steps: usize, pool: u32) -> Vec<TipAction> {
    assert!(pool >= 1, "recipient pool must have at least one slot");
    let mut rng = Lcg::new(seed);
    let mut actions = Vec::with_capacity(steps);

    for _ in 0..steps {
        let kind = rng.bounded(5); // 0-2 → Valid, 3 → BadAmt, 4 → BigMeta
        let recipient_idx = rng.bounded(pool);

        let action = match kind {
            0..=2 => {
                // Valid: amount in 1..=10_000, meta_len in 0..=128
                let raw = rng.next_u32();
                let amount = ((raw % 10_000) as i128) + 1;
                let meta_len = rng.bounded(129); // 0 ..= 128
                TipAction::Valid {
                    recipient_idx,
                    amount,
                    meta_len,
                }
            }
            3 => {
                // BadAmt: amount in -1_000..=0
                let raw = rng.next_u32();
                let amount = -((raw % 1_001) as i128); // in range [-1000, 0]
                TipAction::BadAmt {
                    recipient_idx,
                    amount,
                }
            }
            _ => {
                // BigMeta: meta_len in 129..=512
                let meta_len = rng.bounded(384) + 129; // 129 ..= 512
                TipAction::BigMeta {
                    recipient_idx,
                    meta_len,
                }
            }
        };

        actions.push(action);
    }

    actions
}

/// Invariant helpers for `TipAction` sequences.
impl TipAction {
    /// Returns true when the contract is expected to succeed.
    #[allow(dead_code)]
    pub fn is_valid(&self) -> bool {
        matches!(self, TipAction::Valid { .. })
    }

    /// Returns the expected panic substring, or `None` for valid actions.
    pub fn expected_panic(&self) -> Option<&'static str> {
        match self {
            TipAction::Valid { .. } => None,
            TipAction::BadAmt { .. } => Some("tip amount must be positive"),
            TipAction::BigMeta { .. } => Some("proof metadata too long"),
        }
    }
}

#[cfg(test)]
mod generator_tests {
    use super::*;

    #[test]
    fn lcg_same_seed_produces_same_sequence() {
        let a = generate_actions(42, 20);
        let b = generate_actions(42, 20);
        assert_eq!(a, b);
    }

    #[test]
    fn lcg_different_seeds_produce_different_sequences() {
        let a = generate_actions(1, 20);
        let b = generate_actions(2, 20);
        assert_ne!(a, b);
    }

    #[test]
    fn tip_actions_same_seed_stable() {
        let a = generate_tip_actions(99, 50, 4);
        let b = generate_tip_actions(99, 50, 4);
        assert_eq!(a, b);
    }

    #[test]
    fn tip_actions_valid_amounts_are_positive() {
        let actions = generate_tip_actions(7, 200, 4);
        for a in &actions {
            if let TipAction::Valid { amount, .. } = a {
                assert!(*amount > 0, "generated valid amount must be positive");
            }
        }
    }

    #[test]
    fn tip_actions_bad_amounts_are_nonpositive() {
        let actions = generate_tip_actions(13, 200, 4);
        for a in &actions {
            if let TipAction::BadAmt { amount, .. } = a {
                assert!(*amount <= 0, "generated bad amount must be <= 0");
            }
        }
    }

    #[test]
    fn tip_actions_big_meta_exceeds_cap() {
        let actions = generate_tip_actions(31, 200, 4);
        for a in &actions {
            if let TipAction::BigMeta { meta_len, .. } = a {
                assert!(*meta_len > 128, "generated big meta len must exceed 128");
            }
        }
    }

    #[test]
    fn tip_actions_valid_meta_within_bounds() {
        let actions = generate_tip_actions(77, 200, 4);
        for a in &actions {
            if let TipAction::Valid { meta_len, .. } = a {
                assert!(*meta_len <= 128, "generated valid meta len must be <= 128");
            }
        }
    }

    #[test]
    fn tip_actions_expected_panic_consistency() {
        let actions = generate_tip_actions(55, 100, 3);
        for a in &actions {
            match a {
                TipAction::Valid { .. } => assert!(a.expected_panic().is_none()),
                TipAction::BadAmt { .. } => {
                    assert_eq!(a.expected_panic(), Some("tip amount must be positive"))
                }
                TipAction::BigMeta { .. } => {
                    assert_eq!(a.expected_panic(), Some("proof metadata too long"))
                }
            }
        }
    }

    #[test]
    fn generate_tip_actions_mix_contains_all_variants() {
        // With enough steps at least one of each variant should appear.
        let actions = generate_tip_actions(0, 300, 8);
        let has_valid = actions.iter().any(|a| matches!(a, TipAction::Valid { .. }));
        let has_bad = actions
            .iter()
            .any(|a| matches!(a, TipAction::BadAmt { .. }));
        let has_big = actions
            .iter()
            .any(|a| matches!(a, TipAction::BigMeta { .. }));
        assert!(has_valid, "expected at least one Valid action");
        assert!(has_bad, "expected at least one BadAmt action");
        assert!(has_big, "expected at least one BigMeta action");
    }
}
