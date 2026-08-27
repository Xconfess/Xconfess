#![allow(dead_code)]

#[path = "../../error.rs"]
mod shared_error;

// Re-export shared error definitions from parent workspace.
#[allow(unused_imports)]
pub use shared_error::{codes, ContractError, ErrorClassification, ERROR_REGISTRY_VERSION};
