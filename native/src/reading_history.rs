//! Original legacy reading projections and bootstrap qualification over owned data.
mod resources;
use research_workbench_native_sdk::{
    analysis_history::contracts::PaperAnalysisWorkflow,
    paper_context::PaperAiReadingAttachmentStatus,
    reading_history::{
        ReadingHistoryDecisionV1 as Decision, ReadingHistoryInputV1 as Input,
        contracts::{
            PaperAiReadingSessionDetail, PaperAiReadingTurnDebugData, PaperReadingBootstrapOptions,
            PaperReadingStructuredHistoryOption,
        },
    },
};
pub use resources::static_sql;

pub fn debug_identity(turn_id: &str) -> Result<String, String> {
    let turn_id = turn_id.trim();
    if turn_id.is_empty() {
        return Err("AI 阅读 turn ID 不能为空".into());
    }
    Ok(turn_id.into())
}

pub fn archive_identity(session_id: &str) -> Result<String, String> {
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("AI 阅读会话 ID 不能为空".into());
    }
    Ok(session_id.into())
}

pub fn debug_record(
    row: Option<research_workbench_native_sdk::reading_history::ReadingDebugRowV1>,
) -> Result<PaperAiReadingTurnDebugData, String> {
    let row = row.ok_or_else(|| "找不到 AI 阅读 turn".to_owned())?;
    Ok(PaperAiReadingTurnDebugData {
        turn_id: row.turn_id,
        raw_request: row
            .raw_request_json
            .map(|raw| serde_json::from_str(&raw))
            .transpose()
            .map_err(|_| "AI 阅读原始请求记录损坏".to_owned())?,
        raw_response: row
            .raw_response_json
            .map(|raw| serde_json::from_str(&raw))
            .transpose()
            .map_err(|_| "AI 阅读原始返回记录损坏".to_owned())?,
    })
}

fn unavailable(reason: &str) -> PaperReadingBootstrapOptions {
    PaperReadingBootstrapOptions {
        default_kind: "fresh_paper".into(),
        structured_history: None,
        unavailable_reason: Some(reason.into()),
    }
}
pub fn unavailable_for_sources(
    statuses: &[PaperAiReadingAttachmentStatus],
) -> Option<PaperReadingBootstrapOptions> {
    statuses
        .iter()
        .any(|status| status.parse_status != "available")
        .then(|| unavailable("当前 PDF 尚未完成结构化解析"))
}
pub fn workflow_has_overview(workflow: &PaperAnalysisWorkflow) -> bool {
    workflow
        .turns
        .iter()
        .any(|turn| turn.kind == "paper_overview" && turn.status == "succeeded")
}
pub fn unavailable_for_workflow(
    workflow: Option<&PaperAnalysisWorkflow>,
) -> Option<PaperReadingBootstrapOptions> {
    match workflow {
        None => Some(unavailable("尚无可复用的结构化阅读历史")),
        Some(workflow) if !workflow_has_overview(workflow) => {
            Some(unavailable("最近的结构化阅读尚未生成概要候选"))
        }
        Some(_) => None,
    }
}
pub fn bootstrap_options(
    workflow: PaperAnalysisWorkflow,
    statuses: &[PaperAiReadingAttachmentStatus],
    attachments: &[(String, String, String)],
) -> PaperReadingBootstrapOptions {
    let current = statuses
        .iter()
        .filter_map(|status| {
            Some((
                status.attachment_id.clone(),
                status.content_sha256.clone(),
                status.parse_run_id.clone()?,
            ))
        })
        .collect::<Vec<_>>();
    if attachments != current {
        return unavailable("当前 PDF 或 Docling 解析版本已变化，请重新运行结构化阅读");
    }
    let completed_turns = workflow
        .turns
        .iter()
        .filter(|turn| turn.status == "succeeded")
        .map(|turn| turn.kind.clone())
        .collect();
    PaperReadingBootstrapOptions {
        default_kind: "structured_history".into(),
        structured_history: Some(PaperReadingStructuredHistoryOption {
            workflow_id: workflow.id,
            workflow_revision: workflow.revision,
            workflow_status: workflow.status,
            provider_id: workflow.provider_id,
            model_id: workflow.model_id,
            completed_turns,
            attachment_count: statuses.len(),
            updated_at: workflow.updated_at,
        }),
        unavailable_reason: None,
    }
}
pub fn project(input: Input) -> Decision {
    project_checked(input).unwrap_or_else(|message| Decision::Rejected { message })
}
fn project_checked(input: Input) -> Result<Decision, String> {
    Ok(match input {
        Input::List { rows } => Decision::List {
            sessions: rows
                .into_iter()
                .map(|row| crate::paper_context_prepare::session_summary(Some(row)))
                .collect::<Result<_, _>>()?,
        },
        Input::Session { summary, turns } => Decision::Session {
            session: Box::new(PaperAiReadingSessionDetail {
                summary: crate::paper_context_prepare::session_summary(summary.map(|row| *row))?,
                turns,
            }),
        },
        Input::DebugIdentity { turn_id } => Decision::DebugIdentity {
            turn_id: debug_identity(&turn_id)?,
        },
        Input::DebugRecord { row } => Decision::DebugRecord {
            data: debug_record(row)?,
        },
        Input::Archive { session_id } => Decision::Archive {
            session_id: archive_identity(&session_id)?,
        },
        Input::BootstrapSources { statuses } => match unavailable_for_sources(&statuses) {
            Some(options) => Decision::Bootstrap { options },
            None => Decision::HistoryRequired {},
        },
        Input::BootstrapHistory { workflow } => match unavailable_for_workflow(workflow.as_deref())
        {
            Some(options) => Decision::Bootstrap { options },
            None => Decision::SnapshotRequired {
                context_snapshot_id: workflow
                    .expect("workflow was qualified above")
                    .context_snapshot_id,
            },
        },
        Input::BootstrapSnapshot {
            statuses,
            workflow,
            attachments,
        } => Decision::Bootstrap {
            options: bootstrap_options(*workflow, &statuses, &attachments),
        },
    })
}

#[cfg(test)]
mod tests;
