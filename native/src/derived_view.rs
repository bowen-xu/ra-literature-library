//! Original derived-view validation at the original read/write boundaries.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError, derived_view::*,
};
use std::collections::HashSet;
pub mod manual;
pub mod storage;
pub fn next_provenance(current: &str, review: &str) -> String {
    if current == "ai_suggestion" && review == "accepted" {
        "ai_accepted_after_edit".into()
    } else {
        current.into()
    }
}
pub fn validate(input: &DerivedValidationInputV1) -> Result<(), AiError> {
    use DerivedValidationInputV1 as Input;
    match input {
        Input::Provenance { provenance_kind } => {
            if !matches!(
                provenance_kind.as_str(),
                "ai_suggestion" | "ai_accepted_after_edit"
            ) {
                return Err(invalid("AI 派生视图审查来源无效"));
            }
        }
        Input::Header { draft } => {
            let input_ids = draft
                .inputs
                .iter()
                .map(|input| &input.object_id)
                .collect::<HashSet<_>>();
            let item_ids = draft
                .items
                .iter()
                .map(|item| &item.id)
                .collect::<HashSet<_>>();
            if !matches!(
                draft.view_kind.as_str(),
                "taxonomy" | "historical_context" | "gap_hypothesis" | "innovation_hypothesis"
            ) || draft.title.trim().is_empty()
                || draft.title.chars().count() > 240
                || draft.scope_note.chars().count() > 4_000
                || !(1..=100).contains(&draft.inputs.len())
                || input_ids.len() != draft.inputs.len()
                || !(1..=100).contains(&draft.items.len())
                || item_ids.len() != draft.items.len()
                || !matches!(
                    draft.review_state.as_str(),
                    "unreviewed" | "accepted" | "rejected" | "deferred"
                )
                || draft.change_reason.trim().is_empty()
                || draft.change_reason.len() > 120
            {
                return Err(invalid("派生研究视图参数无效"));
            }
        }
        Input::Input { input, .. } => {
            if input.object_kind != "matrix_cell"
                || input.object_revision < 1
                || input.selection_reason.chars().count() > 500
            {
                return Err(invalid("派生视图输入无效"));
            }
        }
        Input::Coverage { snapshot, .. } => {
            if snapshot.coverage_state != "populated" {
                return Err(invalid("派生视图输入必须是有来源的已填充单元"));
            }
        }
        Input::Item {
            view_kind,
            item,
            allowed_anchors,
            ..
        } => {
            let allowed = allowed_anchors.iter().collect::<HashSet<_>>();
            let anchors = item.evidence_anchor_ids.iter().collect::<HashSet<_>>();
            let hypothesis = matches!(
                view_kind.as_str(),
                "gap_hypothesis" | "innovation_hypothesis"
            );
            if item.id.is_empty()
                || item.id.len() > 80
                || item.text.trim().is_empty()
                || item.text.chars().count() > 4_000
                || !matches!(
                    item.epistemic_role.as_str(),
                    "synthesis" | "inference" | "hypothesis"
                )
                || hypothesis && item.epistemic_role != "hypothesis"
                || !(1..=16).contains(&item.evidence_anchor_ids.len())
                || anchors.len() != item.evidence_anchor_ids.len()
                || item
                    .evidence_anchor_ids
                    .iter()
                    .any(|id| !allowed.contains(id))
            {
                return Err(invalid("派生视图条目必须由所选输入证据支持"));
            }
        }
    }
    Ok(())
}
fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.into())
}
pub fn static_sql() -> [&'static str; 3] {
    [
        include_str!("../data/derived-view-ai-insert.v1.sql"),
        include_str!("../data/derived-view-ai-revision.v1.sql"),
        include_str!("../data/derived-view-input-snapshot.v1.sql"),
    ]
}
#[cfg(test)]
mod tests;
