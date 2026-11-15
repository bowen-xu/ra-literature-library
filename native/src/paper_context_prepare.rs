//! Original legacy-session and screenshot membership decisions over owned values.
use research_workbench_native_sdk::{
    paper_context::PaperAiReadingAttachmentStatus,
    paper_context_prepare::{
        PaperAiReadingSessionSummary, PaperPreparationDecisionV1 as Decision,
        PaperPreparationInputV1 as Input, ReadingSessionRowV1,
    },
};
pub fn session_summary(
    row: Option<ReadingSessionRowV1>,
) -> Result<PaperAiReadingSessionSummary, String> {
    let row = row.ok_or_else(|| "找不到 AI 阅读会话".to_owned())?;
    Ok(PaperAiReadingSessionSummary {
        id: row.id,
        paper_id: row.paper_id,
        context_snapshot_id: row.context_snapshot_id,
        // The original legacy reader deliberately defaults malformed lists.
        attachment_ids: serde_json::from_str(&row.attachment_ids_json).unwrap_or_default(),
        parse_run_ids: serde_json::from_str(&row.parse_run_ids_json).unwrap_or_default(),
        provider_id: row.provider_id,
        model_id: row.model_id,
        reasoning_effort: row.reasoning_effort,
        bootstrap_kind: row.bootstrap_kind,
        source_workflow_id: row.source_workflow_id,
        source_workflow_revision: row.source_workflow_revision,
        bootstrap_hash: row.bootstrap_hash,
        concept_retrieval_default: row.concept_retrieval_default,
        title: row.title,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}
pub fn snapshot_ready(statuses: &[PaperAiReadingAttachmentStatus]) -> bool {
    !statuses
        .iter()
        .any(|status| status.parse_status != "available" || status.parse_run_id.is_none())
}
pub fn image_identity(current: &str, existing: &[String]) -> Result<(), String> {
    if existing.iter().any(|id| id == current) {
        return Err("图片截图包含重复结构化块 ID".to_owned());
    }
    Ok(())
}
pub fn image_set(requested: &[String], available: &[String]) -> Result<(), String> {
    if available.len() != requested.len() {
        return Err("图片截图数量与 Docling picture 结构块不一致".to_owned());
    }
    for id in requested {
        if !available.contains(id) {
            return Err(format!("缺少结构化图片块 {id} 的截图"));
        }
    }
    Ok(())
}
pub fn evaluate(input: Input) -> Decision {
    let result = match input {
        Input::AnalysisSources {
            statuses,
            picture_count,
        } => crate::analysis_workflow::validate_sources(
            &statuses.iter().map(String::as_str).collect::<Vec<_>>(),
            picture_count,
        )
        .map(|()| Decision::Validated {})
        .map_err(|error| error.to_string()),
        Input::Session { row } => {
            session_summary(row.map(|row| *row)).map(|session| Decision::Session {
                session: Box::new(session),
            })
        }
        Input::SnapshotReady {
            attachment_statuses,
        } => Ok(Decision::Ready {
            available: snapshot_ready(&attachment_statuses),
        }),
        Input::ImageIdentity {
            context_item_id,
            existing_ids,
        } => image_identity(&context_item_id, &existing_ids).map(|()| Decision::Validated {}),
        Input::ImageSet {
            requested_ids,
            available_ids,
        } => image_set(&requested_ids, &available_ids).map(|()| Decision::Validated {}),
    };
    result.unwrap_or_else(|message| Decision::Rejected { message })
}
