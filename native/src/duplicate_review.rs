//! Original duplicate projections and review decisions over owned values.
use crate::catalog::{CatalogDecodeError, Row};
use research_workbench_native_sdk::{
    data::DataRows,
    duplicate_review::{
        DuplicateCandidateBitsV1, DuplicateDecisionCompletionV1, DuplicateDecisionPreparationV1,
        DuplicateDecisionRequestV1, DuplicateRejectionCodeV1, DuplicateRejectionV1, F64BitsV1,
        FinishDuplicateDecisionInputV1, MergeOperation,
    },
};

pub fn project_duplicate_candidates(
    rows: &DataRows,
) -> Result<Vec<DuplicateCandidateBitsV1>, CatalogDecodeError> {
    rows.rows
        .iter()
        .enumerate()
        .map(|(index, values)| {
            let row = Row::new(values, "duplicateCandidates", index, 7)?;
            Ok(DuplicateCandidateBitsV1 {
                id: row.text(0)?,
                left_item_id: row.text(1)?,
                left_title: row.text(2)?,
                right_item_id: row.text(3)?,
                right_title: row.text(4)?,
                reason: row.text(5)?,
                confidence_bits: F64BitsV1::parse(row.text(6)?)
                    .map_err(|_| row.invalid(6, "16 lowercase hexadecimal IEEE754 bits"))?,
            })
        })
        .collect()
}

pub fn project_merge_operations(
    rows: &DataRows,
) -> Result<Vec<MergeOperation>, CatalogDecodeError> {
    rows.rows
        .iter()
        .enumerate()
        .map(|(index, values)| {
            let row = Row::new(values, "mergeOperations", index, 7)?;
            Ok(MergeOperation {
                id: row.text(0)?,
                survivor_item_id: row.text(1)?,
                survivor_title: row.text(2)?,
                merged_item_id: row.text(3)?,
                merged_title: row.text(4)?,
                state: row.text(5)?,
                created_at: row.text(6)?,
            })
        })
        .collect()
}

pub fn validate_decision(decision: &str) -> Result<(), DuplicateRejectionV1> {
    if !matches!(decision, "keep_both" | "dismiss") {
        return Err(DuplicateRejectionV1 {
            code: DuplicateRejectionCodeV1::InvalidInput,
            message: format!("不支持的文献类型：{decision}"),
        });
    }
    Ok(())
}

pub fn finish_decision(affected_rows: u64) -> Result<(), DuplicateRejectionV1> {
    if affected_rows == 0 {
        return Err(DuplicateRejectionV1 {
            code: DuplicateRejectionCodeV1::NotFound,
            message: "找不到文献或附件".into(),
        });
    }
    Ok(())
}

pub fn prepare_decision(request: DuplicateDecisionRequestV1) -> DuplicateDecisionPreparationV1 {
    match validate_decision(&request.decision) {
        Ok(()) => DuplicateDecisionPreparationV1::Ready { request },
        Err(error) => DuplicateDecisionPreparationV1::Rejected { error },
    }
}

pub fn complete_decision(input: &FinishDuplicateDecisionInputV1) -> DuplicateDecisionCompletionV1 {
    // The original finisher checks only the actual count. Request identity is
    // bound by Core; revalidating decision here would change the post-SQL stage.
    match finish_decision(input.affected_rows) {
        Ok(()) => DuplicateDecisionCompletionV1::Applied {},
        Err(error) => DuplicateDecisionCompletionV1::Rejected { error },
    }
}

#[cfg(test)]
mod tests;
