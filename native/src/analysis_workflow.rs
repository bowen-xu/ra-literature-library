//! Original preparation and lifecycle policy, over owned application observations.
use research_workbench_native_sdk::{
    analysis_history::contracts::{
        PaperAnalysisMessage, PaperAnalysisMessageKind, PaperAnalysisWorkflow,
    },
    analysis_workflow::{AnalysisWorkflowError, FailureStatuses, PaperAnalysisWorkflowDraft},
};
pub mod attempt_input;
pub mod candidate;
mod context;
pub mod docling;
pub mod docling_prompt;
pub mod matrix;
pub mod matrix_evidence;
pub(crate) mod wire;
pub use context::pack;
mod conversation;
pub mod overview_task;
pub mod portrait;
pub mod recovery;
pub mod research;
pub mod submission;
pub mod suggestion;
pub mod task_preview;
pub mod task_prompt;
pub mod template;
pub use conversation::{existing_conversation, validate_generation_availability};
#[cfg(test)]
mod attempt_wire_tests;
#[cfg(test)]
mod docling_wire_tests;
#[cfg(test)]
mod tests;

pub fn validate_start(revision: i64, has_template: bool) -> Result<(), AnalysisWorkflowError> {
    if revision < 1 && !has_template {
        return Err(AnalysisWorkflowError::InvalidInput(
            "阅读框架尚未确认，无法启动论文分析".into(),
        ));
    }
    Ok(())
}

pub fn validate_sources(
    statuses: &[&str],
    picture_count: usize,
) -> Result<(), AnalysisWorkflowError> {
    if statuses.iter().any(|status| *status != "available") {
        return Err(AnalysisWorkflowError::InvalidInput(
            "部分 PDF 尚未完成 Docling 结构化解析".into(),
        ));
    }
    const MAX_IMAGE_COUNT: usize = 128;
    if picture_count > MAX_IMAGE_COUNT {
        return Err(AnalysisWorkflowError::InvalidInput(format!(
            "图片结构块数量为 {picture_count}，超过本轮上限 {MAX_IMAGE_COUNT}"
        )));
    }
    Ok(())
}

pub fn validate_reuse(
    regenerate: bool,
    template_json: Option<&str>,
    existing: Option<&PaperAnalysisWorkflow>,
) -> Result<(), AnalysisWorkflowError> {
    let Some(existing) = existing else {
        return Ok(());
    };
    let same_template = template_json.is_none_or(|json| {
        existing
            .turns
            .iter()
            .find(|turn| turn.kind == "paper_overview")
            .and_then(|turn| turn.attempts.last())
            .is_some_and(|attempt| {
                attempt
                    .normalized_messages
                    .iter()
                    .any(|message| message.content == json)
            })
    });
    let same_stages = !existing
        .turns
        .iter()
        .any(|turn| turn.kind == "paper_concept_map");
    if !regenerate
        && same_template
        && same_stages
        && !matches!(existing.status.as_str(), "failed" | "canceled")
        && !(existing.status == "preparing"
            && existing.turns.iter().all(|turn| turn.attempts.is_empty()))
    {
        return Err(AnalysisWorkflowError::InvalidInput(
            "当前论文上下文已经存在分析工作流".into(),
        ));
    }
    Ok(())
}

pub fn validate_draft(draft: &PaperAnalysisWorkflowDraft) -> Result<(), AnalysisWorkflowError> {
    if draft.paper_id.trim().is_empty()
        || draft.context_snapshot_id.trim().is_empty()
        || draft.provider_id.trim().is_empty()
        || draft.model_id.trim().is_empty()
        || draft.prompt_set_version.trim().is_empty()
    {
        return Err(AnalysisWorkflowError::InvalidInput(
            "论文分析工作流参数不完整".into(),
        ));
    }
    Ok(())
}

pub fn overview_messages(workflow: &PaperAnalysisWorkflow) -> Vec<PaperAnalysisMessage> {
    vec![
        PaperAnalysisMessage::new(
            PaperAnalysisMessageKind::SystemContext,
            format!(
                "Use immutable paper context snapshot {} for paper {}.",
                workflow.context_snapshot_id, workflow.paper_id
            ),
        ),
        PaperAnalysisMessage::new(
            PaperAnalysisMessageKind::TaskPrompt,
            "Extract only the structured paper overview using the confirmed reading profile and source evidence IDs. Finish after this structured-reading result.",
        ),
    ]
}

pub fn running_workflow_status(turn_kind: &str) -> &'static str {
    if turn_kind == "paper_overview" {
        "overview_running"
    } else {
        "concepts_running"
    }
}

pub fn completion_status(turn_kind: &str, has_concept_turn: bool) -> &'static str {
    if turn_kind == "paper_overview" && has_concept_turn {
        "overview_ready"
    } else {
        "needs_review"
    }
}

pub fn failure_statuses(turn_kind: &str, code: &str) -> FailureStatuses {
    let (attempt, turn, workflow) = if code == "canceled" {
        ("canceled", "canceled", "canceled")
    } else if code == "interrupted" {
        (
            "interrupted",
            "interrupted",
            if turn_kind == "paper_overview" {
                "failed"
            } else {
                "partial"
            },
        )
    } else {
        (
            "failed",
            "failed",
            if turn_kind == "paper_overview" {
                "failed"
            } else {
                "partial"
            },
        )
    };
    FailureStatuses {
        attempt: attempt.into(),
        turn: turn.into(),
        workflow: workflow.into(),
    }
}
