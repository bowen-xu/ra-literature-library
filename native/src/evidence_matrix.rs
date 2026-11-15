//! Original pure matrix checks, at the original validation stages.
use research_workbench_native_sdk::evidence_matrix::*;
use std::collections::HashSet;

pub fn decide(input: &MatrixValidationInputV1) -> MatrixValidationDecisionV1 {
    let result = match input {
        MatrixValidationInputV1::Matrix { draft } => validate_matrix(draft),
        MatrixValidationInputV1::Cell { draft, matrix } => validate_cell(draft, matrix),
        MatrixValidationInputV1::Statement {
            statement,
            prior_statement_ids,
        } => validate_statement(statement, prior_statement_ids),
    };
    MatrixValidationDecisionV1 {
        rejection: result.err(),
    }
}

fn validate_matrix(draft: &EvidenceMatrixDraft) -> Result<(), MatrixRejectionV1> {
    let paper_ids = draft.paper_ids.iter().collect::<HashSet<_>>();
    let dimension_ids = draft
        .dimensions
        .iter()
        .map(|item| &item.id)
        .collect::<HashSet<_>>();
    if draft.title.trim().is_empty()
        || draft.title.chars().count() > 240
        || !(2..=20).contains(&draft.paper_ids.len())
        || paper_ids.len() != draft.paper_ids.len()
        || !(1..=20).contains(&draft.dimensions.len())
        || dimension_ids.len() != draft.dimensions.len()
        || draft.dimensions.iter().any(|item| {
            item.id.is_empty()
                || item.id.len() > 80
                || item.label.trim().is_empty()
                || item.label.chars().count() > 120
        })
        || draft.change_reason.trim().is_empty()
        || draft.change_reason.len() > 120
    {
        return Err(MatrixRejectionV1::Matrix);
    }
    Ok(())
}

fn validate_cell(
    draft: &EvidenceMatrixCellDraft,
    matrix: &EvidenceMatrix,
) -> Result<(), MatrixRejectionV1> {
    let in_scope = matrix.paper_ids.contains(&draft.paper_id)
        && matrix
            .dimensions
            .iter()
            .any(|item| item.id == draft.dimension_id);
    let coverage_valid = match draft.coverage_state.as_str() {
        "unreviewed" | "not_found" => draft.statements.is_empty(),
        "populated" => !draft.statements.is_empty(),
        _ => false,
    };
    if !in_scope
        || !coverage_valid
        || draft.coverage_note.chars().count() > 2_000
        || draft.statements.len() > 20
        || draft.change_reason.trim().is_empty()
        || draft.change_reason.len() > 120
    {
        return Err(MatrixRejectionV1::Cell);
    }
    Ok(())
}

fn validate_statement(
    statement: &EvidenceMatrixStatement,
    prior_statement_ids: &[String],
) -> Result<(), MatrixRejectionV1> {
    let anchor_ids = statement.evidence_anchor_ids.iter().collect::<HashSet<_>>();
    if statement.id.is_empty()
        || statement.id.len() > 80
        || prior_statement_ids.iter().any(|id| id == &statement.id)
        || statement.text.trim().is_empty()
        || statement.text.chars().count() > 4_000
        || !matches!(
            statement.epistemic_role.as_str(),
            "source_paraphrase" | "synthesis" | "inference" | "hypothesis"
        )
        || !(1..=8).contains(&statement.evidence_anchor_ids.len())
        || anchor_ids.len() != statement.evidence_anchor_ids.len()
    {
        return Err(MatrixRejectionV1::Statement);
    }
    Ok(())
}

/// Static composition consumes the same canonical domain assets.
pub fn static_sql() -> [&'static str; 14] {
    [
        include_str!("../data/evidence-matrix-ids.v1.sql"),
        include_str!("../data/evidence-matrix-cell-header.v1.sql"),
        include_str!("../data/evidence-matrix-cell-keys.v1.sql"),
        include_str!("../data/evidence-matrix-insert.v1.sql"),
        include_str!("../data/evidence-matrix-header.v1.sql"),
        include_str!("../data/evidence-matrix-update.v1.sql"),
        include_str!("../data/evidence-matrix-revision.v1.sql"),
        include_str!("../data/evidence-matrix-cell-insert.v1.sql"),
        include_str!("../data/evidence-matrix-cell-update.v1.sql"),
        include_str!("../data/evidence-matrix-cell-revision.v1.sql"),
        include_str!("../data/evidence-matrix-matrix.v1.sql"),
        include_str!("../data/evidence-matrix-cell.v1.sql"),
        include_str!("../data/evidence-matrix-project-belongs.v1.sql"),
        include_str!("../data/evidence-matrix-anchor-belongs.v1.sql"),
    ]
}

#[cfg(test)]
mod tests;
