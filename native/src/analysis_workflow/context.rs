//! A frozen paper is one material; retain block identities inside its source bundle.
use research_agent_core::submission::{ContextSourceKind, ContextText};
use research_workbench_native_sdk::analysis_workflow::AnalysisWorkflowError as AiError;
use sha2::{Digest, Sha256};

pub fn pack(sources: Vec<ContextText>) -> Result<Vec<ContextText>, AiError> {
    if sources.is_empty() {
        return Ok(sources);
    }
    let first = &sources[0];
    if sources.iter().any(|source| {
        source.kind != ContextSourceKind::Paper
            || source.resource_id != first.resource_id
            || source.revision != first.revision
    }) {
        return Err(AiError::InvalidInput(
            "论文来源包不能混合不同文献或版本".into(),
        ));
    }
    let text =
        serde_json::to_string(&serde_json::json!({"kind":"frozenPaperSources","sources":sources}))
            .map_err(|_| AiError::InvalidInput("无法编码论文来源包".into()))?;
    Ok(vec![ContextText {
        source_id: format!("paper-bundle:{:x}", Sha256::digest(text.as_bytes())),
        kind: ContextSourceKind::Paper,
        resource_id: first.resource_id.clone(),
        revision: first.revision.clone(),
        anchor: Some(
            serde_json::json!({"content":"frozenPaperSources","sourceCount":sources.len()})
                .to_string(),
        ),
        text,
    }])
}
