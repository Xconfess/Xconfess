use soroban_sdk::{Env, vec};
use xconfess_contract::checkpoint::{get_checkpoint_summary, get_snapshot_page};
use xconfess_contract::confession::Confession;
use xconfess_contract::reaction::Reaction;
use xconfess_contract::report::Report;

#[test]
fn test_checkpoint_summary() {
    let env = Env::default();

    let confessions = vec![&env, Confession { confession_id: 1, author: env.accounts().next().unwrap(), content_hash: "hash1".into(), timestamp: 1 }];
    let reactions = vec![&env, Reaction { reaction_id: 1, confession_id: 1, reactor: env.accounts().next().unwrap(), reaction_type: "like".into(), timestamp: 1 }];
    let reports = vec![&env, Report { report_id: 1, confession_id: 1, reporter: env.accounts().next().unwrap(), reason: "spam".into(), timestamp: 1 }];

    let summary = get_checkpoint_summary(&env, &confessions, &reactions, &reports);

    assert_eq!(summary.total_confessions, 1);
    assert_eq!(summary.total_reactions, 1);
    assert_eq!(summary.total_reports, 1);
    assert_eq!(summary.latest_confession_id, 1);
}

#[test]
fn test_snapshot_page() {
    let env = Env::default();
    let confessions = vec![
        &env, 
        Confession { confession_id: 1, author: env.accounts().next().unwrap(), content_hash: "hash1".into(), timestamp: 1 },
        Confession { confession_id: 2, author: env.accounts().next().unwrap(), content_hash: "hash2".into(), timestamp: 2 },
    ];

    let page = get_snapshot_page(&confessions, 0, 1, |c: &Confession| c.confession_id);
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].confession_id, 1);
    assert_eq!(page.next_cursor, Some(2));
}