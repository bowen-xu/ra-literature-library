//! Original candidate endpoint selection; no SQL, validation or identity owner.
use research_workbench_native_sdk::duplicate_merge_prepare::{
    MergePreparationV1, MergePrepareInputV1, MergeRejectionV1,
};

/// Preserve the original left-first branch, including identical endpoints.
pub fn source_item_id<'a>(left: &'a str, right: &'a str, survivor: &str) -> Option<&'a str> {
    if survivor == left {
        Some(right)
    } else if survivor == right {
        Some(left)
    } else {
        None
    }
}

pub fn prepare(input: MergePrepareInputV1) -> MergePreparationV1 {
    match source_item_id(
        &input.left_item_id,
        &input.right_item_id,
        &input.survivor_item_id,
    )
    .map(str::to_owned)
    {
        Some(merged_item_id) => MergePreparationV1::Ready {
            input,
            merged_item_id,
            operation_state: "applied".into(),
            created_reading_state: false,
        },
        None => MergePreparationV1::Rejected {
            reason: MergeRejectionV1::NotFound,
        },
    }
}

#[cfg(test)]
mod tests;
