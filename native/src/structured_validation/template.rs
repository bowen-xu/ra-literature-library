//! Original literal-quote rules; template resolution remains with its owner.
pub use research_workbench_native_sdk::candidate_contracts::valid_template_snapshot as valid_snapshot;
use research_workbench_native_sdk::candidate_contracts::{
    AtomicStatement, CandidatePayload, CandidateValidationError as AiError, EvidenceQuote,
};
use std::collections::HashSet;

pub fn validate_quotes(
    payload: &CandidatePayload,
    bundle: &[EvidenceQuote],
) -> Result<(), AiError> {
    let CandidatePayload::PaperOverview(overview) = payload else {
        return Ok(());
    };
    for statement in overview.fields.iter().flat_map(|field| &field.statements) {
        for source in statement.evidence_quotes.iter().flatten() {
            if !bundle.iter().any(|item| {
                item.citation_key == source.evidence_item_id
                    && item.quote_exact.contains(&source.quote)
            }) {
                return Err(AiError::InvalidInput(format!(
                    "结构化陈述 {} 的摘录不是来源 {} 中的连续原文",
                    statement.id, source.evidence_item_id
                )));
            }
        }
    }
    Ok(())
}

/// Quote shape is shared with legacy statements; custom templates additionally require every cited source.
pub fn validate_statement_quotes(
    statement: &AtomicStatement,
    required: bool,
) -> Result<(), AiError> {
    let quotes = statement.evidence_quotes.as_deref().unwrap_or_default();
    if required && quotes.len() != statement.evidence_item_ids.len() {
        return Err(AiError::InvalidInput(format!(
            "陈述 {} 必须为每个引用来源提供一条连续原文摘录",
            statement.id
        )));
    }
    // Template quotes are bounded by frozen-source membership at persistence.
    // Keep the legacy snippet limit for other candidate formats.
    if !required
        && quotes
            .iter()
            .any(|source| source.quote.chars().count() > 1200)
    {
        return Err(AiError::InvalidInput(format!(
            "陈述 {} 的原文摘录超过 1200 字符上限",
            statement.id
        )));
    }
    if quotes.len() > 8
        || quotes
            .iter()
            .map(|source| &source.evidence_item_id)
            .collect::<HashSet<_>>()
            .len()
            != quotes.len()
        || quotes.iter().any(|source| {
            source.quote.trim().is_empty()
                || !statement
                    .evidence_item_ids
                    .contains(&source.evidence_item_id)
        })
    {
        return Err(AiError::InvalidInput(format!(
            "陈述 {} 的摘录不能为空、重复或引用未声明的来源",
            statement.id
        )));
    }
    Ok(())
}
