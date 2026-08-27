/// Shared pagination types for confession registry reads.
///
/// `Page` is the canonical return type for `list_confessions`.  Backend and
/// frontend consumers should import it from here so they stay in sync with the
/// contract definition.
pub use confession_registry::Page;
