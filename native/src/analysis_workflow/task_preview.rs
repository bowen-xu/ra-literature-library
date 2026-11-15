//! Original domain decisions consumed by overview run preparation.
pub mod pages;
pub mod selection;
#[cfg(test)]
mod tests;
use research_workbench_native_sdk::{
    analysis_workflow::AnalysisWorkflowError as AiError,
    generation::{AiTaskSpecDraft, SUGGESTION_CANDIDATE_KINDS},
};
pub fn validate_shape(draft: &AiTaskSpecDraft) -> Result<(), AiError> {
    let has_valid_suggestion_kind = draft
        .suggestion_candidate_kind
        .as_deref()
        .is_some_and(|kind| SUGGESTION_CANDIDATE_KINDS.contains(&kind));
    if (draft.task_kind == "paper_suggestions") != has_valid_suggestion_kind {
        return Err(AiError::InvalidInput("AI 建议任务类型参数无效".to_owned()));
    }
    if (draft.task_kind == "matrix_synthesis") != draft.matrix_synthesis_context.is_some() {
        return Err(AiError::InvalidInput(
            "多文献综合任务上下文参数无效".to_owned(),
        ));
    }
    Ok(())
}

pub fn validate_scope(task_kind: &str, item_kinds: &[String]) -> Result<(), AiError> {
    let is_valid = match task_kind {
        "reference_extraction" => item_kinds.len() == 1 && item_kinds[0] == "anchor",
        "paper_suggestions" => item_kinds.len() == 1 && item_kinds[0] == "attachment",
        "matrix_synthesis" => {
            (2..=32).contains(&item_kinds.len()) && item_kinds.iter().all(|kind| kind == "anchor")
        }
        _ => false,
    };
    if is_valid {
        Ok(())
    } else {
        Err(AiError::InvalidInput("任务类型与显式范围不匹配".to_owned()))
    }
}
