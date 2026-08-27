use super::actions::Action;

pub fn format_action_trace(actions: &[Action]) -> String {
    actions
        .iter()
        .enumerate()
        .map(|(i, a)| format!("#{i}:{a:?}"))
        .collect::<Vec<String>>()
        .join(" | ")
}
