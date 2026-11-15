//! Original history field projection, over Core-owned captured rows.
#[cfg(test)]
mod tests;
use research_workbench_native_sdk::analysis_history::{
    HistoryInputV1, HistoryRejectionV1, HistoryRequestV1, contracts::*, rows::*,
};

pub fn project(input: HistoryInputV1) -> Result<Option<PaperAnalysisWorkflow>, HistoryRejectionV1> {
    match input.workflow {
        Some(capture) => Ok(Some(workflow(capture))),
        None if matches!(input.request, HistoryRequestV1::Get { .. }) => {
            Err(HistoryRejectionV1::NotFound)
        }
        None => Ok(None),
    }
}

fn workflow(capture: CapturedWorkflowV1) -> PaperAnalysisWorkflow {
    let row = capture.row;
    PaperAnalysisWorkflow {
        id: row.id,
        active_client_request_id: None,
        conversation_id: row.conversation_id.and_then(|value| value.parse().ok()),
        paper_id: row.paper_id,
        context_snapshot_id: row.context_snapshot_id,
        status: row.status,
        provider_id: row.provider_id,
        model_id: row.model_id,
        reasoning_effort: row.reasoning_effort,
        prompt_set_version: row.prompt_set_version,
        active_turn_kind: row.active_turn_kind,
        revision: row.revision,
        supersedes_workflow_id: row.supersedes_workflow_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        completed_at: row.completed_at,
        turns: capture.turns.into_iter().map(turn).collect(),
    }
}

fn turn(capture: CapturedTurnV1) -> PaperAnalysisTurn {
    let row = capture.row;
    PaperAnalysisTurn {
        id: row.id,
        workflow_id: row.workflow_id,
        ordinal: row.ordinal,
        kind: row.kind,
        status: row.status,
        candidate_id: row.candidate_id,
        created_at: row.created_at,
        finished_at: row.finished_at,
        attempts: capture.attempts.into_iter().map(attempt).collect(),
    }
}

fn attempt(capture: AttemptRowV1) -> PaperAnalysisAttempt {
    let row = capture;
    PaperAnalysisAttempt {
        id: row.id,
        turn_id: row.turn_id,
        shared_conversation_id: row
            .shared_conversation_id
            .and_then(|value| value.parse().ok()),
        shared_turn_outcome: row.shared_turn_outcome,
        shared_request_id: row.shared_request_id.and_then(|value| value.parse().ok()),
        shared_turn_id: row.shared_turn_id.and_then(|value| value.parse().ok()),
        shared_ai_run_id: row.shared_ai_run_id,
        shared_candidate_id: row.shared_candidate_id,
        shared_terminal_status: row.shared_terminal_status,
        attempt: row.attempt,
        status: row.status,
        normalized_messages: row.normalized_messages,
        provider_id: row.provider_id,
        model_id: row.model_id,
        reasoning_effort: row.reasoning_effort,
        ai_run_id: row.ai_run_id,
        candidate_id: row.candidate_id,
        input_hash: row.input_hash,
        output_hash: row.output_hash,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        error_code: row.error_code,
        error_message: row.error_message,
        created_at: row.created_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
        recovery_reason: row.recovery_reason,
        recovery_version: row.recovery_version,
        recovered_at: row.recovered_at,
    }
}
