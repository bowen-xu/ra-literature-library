use super::*;
use research_workbench_native_sdk::derived_view::manual::*;
pub fn decide(input: &DerivedViewInputV1) -> DerivedViewDecisionV1 {
    match input {
        DerivedViewInputV1::Validate { input } => DerivedViewDecisionV1::Validated {
            rejection: validate(input)
                .err()
                .map(|_| DerivedRejectionV1::for_input(input)),
        },
        DerivedViewInputV1::Provenance { current, review } => DerivedViewDecisionV1::Provenance {
            value: next_provenance(current, review),
        },
    }
}
