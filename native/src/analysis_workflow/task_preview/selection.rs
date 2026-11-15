//! Original selected-anchor validation and two-item evidence projection.
use research_workbench_native_sdk::{
    analysis_workflow::AnalysisWorkflowError as AiError,
    generation::evidence::{AiEvidencePreview, AnchorEvidence},
};
const MAX_QUOTE_CHARS: usize = 1500;
const MAX_CONTEXT_CHARS: usize = 12000;
pub fn preview(input: Option<AnchorEvidence>) -> Result<Vec<AiEvidencePreview>, AiError> {
    let source = source(input)?;
    let context = bounded_context(&source)?;
    Ok(vec![
        preview_from(&source, "ev-quote", "direct_quote", &source.quote_exact),
        preview_from(&source, "ev-context", "context", &context),
    ])
}
pub fn source(source: Option<AnchorEvidence>) -> Result<AnchorEvidence, AiError> {
    let source =
        source.ok_or_else(|| AiError::InvalidInput("原文锚点或对应附件版本已不可用".to_owned()))?;
    if source.quote_exact.trim().is_empty() {
        return Err(AiError::InvalidInput(
            "AI 选区解释要求非空的精确原文引用".to_owned(),
        ));
    }
    if source.quote_exact.chars().count() > MAX_QUOTE_CHARS {
        return Err(AiError::InvalidInput(
            "AI 选区 quote 超过 1,500 字符；请缩短选区后重新预览".to_owned(),
        ));
    }
    Ok(source)
}
pub fn bounded_context(source: &AnchorEvidence) -> Result<String, AiError> {
    let context = format!(
        "{}{}{}",
        source.quote_prefix, source.quote_exact, source.quote_suffix
    );
    if context.chars().count() > MAX_CONTEXT_CHARS {
        return Err(AiError::InvalidInput(
            "AI 选区 context 超过 12,000 字符；请缩小来源范围后重新预览".to_owned(),
        ));
    }
    Ok(context)
}
fn preview_from(
    source: &AnchorEvidence,
    citation_key: &str,
    relation_kind: &str,
    context_text: &str,
) -> AiEvidencePreview {
    AiEvidencePreview {
        citation_key: citation_key.to_owned(),
        anchor_id: source.anchor_id.clone(),
        paper_title: source.paper_title.clone(),
        attachment_id: source.attachment_id.clone(),
        content_sha256: source.content_sha256.clone(),
        page_index: source.page_index,
        page_label: source.page_label.clone(),
        quote_exact: source.quote_exact.clone(),
        context_text: context_text.to_owned(),
        relation_kind: relation_kind.to_owned(),
    }
}

#[cfg(test)]
mod tests;
