//! Original selected matrix anchors, limits and citation ordering.
use research_workbench_native_sdk::{
    analysis_workflow::{AnalysisWorkflowError as AiError, matrix::*},
    generation::evidence::{AiEvidencePreview, AnchorEvidence},
};
pub fn decide(input: MatrixEvidenceInputV1) -> MatrixEvidenceDecisionV1 {
    use MatrixEvidenceInputV1 as Input;
    let rejection = match input {
        Input::Anchor { source: None } => Some(invalid("多文献综合原文锚点或附件版本不可用")),
        Input::Anchor {
            source: Some(source),
        } => source
            .quote_exact
            .trim()
            .is_empty()
            .then(|| invalid("多文献综合不接受空原文锚点")),
        Input::FrozenHash { expected, actual } => (expected.as_deref() != Some(actual.as_str()))
            .then(|| invalid("多文献综合来源附件版本已变化")),
        Input::Sources { sources } => {
            return MatrixEvidenceDecisionV1::Preview {
                result: preview(&sources),
            };
        }
    };
    MatrixEvidenceDecisionV1::Validated { rejection }
}
fn preview(sources: &[AnchorEvidence]) -> Result<Vec<AiEvidencePreview>, AiError> {
    if !(2..=32).contains(&sources.len()) {
        return Err(invalid("多文献综合需要 2–32 条冻结来源"));
    }
    if sources
        .iter()
        .any(|source| source.quote_exact.chars().count() > 1_500)
    {
        return Err(invalid(
            "多文献综合单条 quote 超过 1,500 字符；请缩短对应原文选区",
        ));
    }
    if sources
        .iter()
        .map(|source| context(source).chars().count())
        .sum::<usize>()
        > 48_000
    {
        return Err(invalid(
            "多文献综合 context 总量超过 48,000 字符；请减少单元或缩短原文选区",
        ));
    }
    Ok(sources
        .iter()
        .enumerate()
        .map(|(ordinal, source)| AiEvidencePreview {
            citation_key: format!("ev-source-{}", ordinal + 1),
            anchor_id: source.anchor_id.clone(),
            paper_title: source.paper_title.clone(),
            attachment_id: source.attachment_id.clone(),
            content_sha256: source.content_sha256.clone(),
            page_index: source.page_index,
            page_label: source.page_label.clone(),
            quote_exact: source.quote_exact.clone(),
            context_text: context(source),
            relation_kind: "direct_quote".into(),
        })
        .collect())
}
fn context(source: &AnchorEvidence) -> String {
    format!(
        "{}{}{}",
        source.quote_prefix, source.quote_exact, source.quote_suffix
    )
}
fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.into())
}
