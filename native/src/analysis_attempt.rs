//! Original attempt eligibility only; preparation, identities and commits stay out.
use research_workbench_native_sdk::analysis_attempt::{
    AnalysisAttemptPlan, AnalysisAttemptWorkflowObservation,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum AnalysisAttemptError {
    #[error("未知论文分析阶段")]
    UnknownTurnKind,
    #[error("论文分析规范化消息为空或超过上限")]
    InvalidMessages,
    #[error("该论文分析工作流已结束，不能再次运行")]
    WorkflowEnded,
    #[error("结构化阅读概要尚未成功，不能抽取概念")]
    OverviewRequired,
    #[error("analysis temporarily unavailable")]
    MissingTurn,
    #[error("该论文分析阶段正在运行或已经成功")]
    TurnUnavailable,
}

pub fn validate_turn_kind(turn_kind: &str) -> Result<(), AnalysisAttemptError> {
    if matches!(turn_kind, "paper_overview" | "paper_concept_map") {
        Ok(())
    } else {
        Err(AnalysisAttemptError::UnknownTurnKind)
    }
}

/// Content is borrowed unchanged. Message kind and source ownership are not
/// qualification inputs, and the 512000 limit remains UTF-8 bytes, not chars.
pub fn validate_message_contents(contents: &[&str]) -> Result<(), AnalysisAttemptError> {
    if contents.is_empty()
        || contents.len() > 8
        || contents
            .iter()
            .any(|content| content.trim().is_empty() || content.len() > 512_000)
    {
        return Err(AnalysisAttemptError::InvalidMessages);
    }
    Ok(())
}

/// Call input validation before the original workflow read. Observations keep
/// its order: first matching overview/turn, then the last observed attempt.
/// This projection is not a complete commit read set or resource authorization.
pub fn plan_start_attempt(
    turn_kind: &str,
    workflow: &AnalysisAttemptWorkflowObservation,
) -> Result<AnalysisAttemptPlan, AnalysisAttemptError> {
    validate_turn_kind(turn_kind)?;
    if workflow.status == "superseded"
        || workflow.status == "canceled" && turn_kind == "paper_overview"
    {
        return Err(AnalysisAttemptError::WorkflowEnded);
    }
    if turn_kind == "paper_concept_map"
        && workflow
            .turns
            .iter()
            .find(|turn| turn.kind == "paper_overview")
            .is_none_or(|turn| turn.status != "succeeded")
    {
        return Err(AnalysisAttemptError::OverviewRequired);
    }
    let turn = workflow
        .turns
        .iter()
        .find(|turn| turn.kind == turn_kind)
        .ok_or(AnalysisAttemptError::MissingTurn)?;
    if turn.status == "running" || turn.status == "succeeded" {
        return Err(AnalysisAttemptError::TurnUnavailable);
    }
    // Keep the original +1 and profile-dependent overflow behavior unchanged.
    let next_attempt = turn.attempt_numbers.last().map_or(1, |number| number + 1);
    Ok(AnalysisAttemptPlan {
        turn_id: turn.id.clone(),
        next_attempt,
    })
}

#[cfg(test)]
mod tests;
