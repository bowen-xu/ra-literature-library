//! Canonical original metadata decisions. Core retains SQL, IDs and settlement.
pub use research_workbench_native_sdk::metadata::*;

mod patch;
pub mod policy;
mod preparation;
mod values;
pub use patch::{field_name, is_supported_item_type, prepare_patch, validate_item_type};
pub use policy::{FIELD_NAMES, derivation_policy};
pub use preparation::{confirm_fields, prepare, update_sources};
pub use values::{diffs, draft_from_item, draft_values, patch_from_draft};

/// A malformed internal preparation is distinct from an original domain rejection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum MetadataPreparationError {
    #[error("literature_metadata_input_invalid: DOI patch lacks its prepared Core DOI")]
    MissingPreparedDoi,
}

#[cfg(test)]
mod tests;
