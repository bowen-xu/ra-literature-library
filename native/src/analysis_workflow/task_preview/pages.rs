//! Original page ranking and excerpts over Core-owned attachment and page observations.
use research_workbench_native_sdk::{
    analysis_workflow::AnalysisWorkflowError as AiError, generation::evidence::*,
};
use sha2::{Digest, Sha256};

pub use research_workbench_native_sdk::generation::evidence::PAGE_EVIDENCE_CONFIG_VERSION as RETRIEVAL_CONFIG_VERSION;
const MAX_PAGES: usize = 10;
const MAX_QUOTE_CHARS: usize = 1_200;
const CONTEXT_CHARS: usize = 160;

const KEYWORDS: [&str; 28] = [
    "abstract",
    "research question",
    "objective",
    "purpose",
    "method",
    "methods",
    "approach",
    "experiment",
    "participants",
    "dataset",
    "result",
    "results",
    "finding",
    "findings",
    "conclusion",
    "conclusions",
    "discussion",
    "limitation",
    "limitations",
    "future work",
    "摘要",
    "研究问题",
    "方法",
    "实验",
    "结果",
    "结论",
    "局限",
    "未来工作",
];

pub fn preview_sources(sources: &[OverviewPageEvidence]) -> Vec<AiEvidencePreview> {
    sources
        .iter()
        .enumerate()
        .map(|(ordinal, source)| AiEvidencePreview {
            citation_key: citation_key(ordinal),
            anchor_id: source.anchor_id.clone(),
            paper_title: source.paper_title.clone(),
            attachment_id: source.attachment_id.clone(),
            content_sha256: source.content_sha256.clone(),
            page_index: source.page_index,
            page_label: Some((source.page_index + 1).to_string()),
            quote_exact: source.quote_exact.clone(),
            context_text: context(source),
            relation_kind: "direct_quote".to_owned(),
        })
        .collect()
}

pub fn validate_attachment(attachment: Option<&AttachmentEvidence>) -> Result<(), AiError> {
    let attachment = attachment
        .ok_or_else(|| AiError::InvalidInput("找不到论文概要对应的 PDF 附件".to_owned()))?;
    if attachment.index_state != "completed" {
        return Err(AiError::InvalidInput(
            "请先打开 PDF，等待页文本索引完成后再起草概要".to_owned(),
        ));
    }
    Ok(())
}

pub fn select_pages(
    attachment: &AttachmentEvidence,
    attachment_id: &str,
    pages: &[(i64, String)],
) -> Result<Vec<OverviewPageEvidence>, AiError> {
    if pages.is_empty() {
        return Err(AiError::InvalidInput(
            "PDF 页文本索引为空，无法建立可核验概要".to_owned(),
        ));
    }
    let mut ranked = pages
        .iter()
        .map(|(page_index, text)| (*page_index, page_score(*page_index, text), text))
        .collect::<Vec<_>>();
    ranked.sort_by_key(|(page_index, score, _)| (std::cmp::Reverse(*score), *page_index));
    ranked.truncate(MAX_PAGES);
    ranked.sort_by_key(|(page_index, _, _)| *page_index);
    Ok(ranked
        .into_iter()
        .map(|(page_index, _, text)| {
            let (quote_prefix, quote_exact, quote_suffix) = excerpt(text);
            OverviewPageEvidence {
                anchor_id: anchor_id(
                    attachment_id,
                    &attachment.content_sha256,
                    page_index,
                    &quote_exact,
                ),
                paper_id: attachment.paper_id.clone(),
                paper_title: attachment.paper_title.clone(),
                attachment_id: attachment_id.to_owned(),
                content_sha256: attachment.content_sha256.clone(),
                page_index,
                quote_exact,
                quote_prefix,
                quote_suffix,
            }
        })
        .collect())
}
fn page_score(page_index: i64, text: &str) -> usize {
    let lower = text.to_lowercase();
    let keyword_score = KEYWORDS
        .iter()
        .filter(|keyword| lower.contains(**keyword))
        .count()
        * 10;
    keyword_score + usize::from(page_index == 0) * 25 + usize::from(page_index == 1) * 10
}

fn excerpt(text: &str) -> (String, String, String) {
    let characters = text.chars().collect::<Vec<_>>();
    let lower = text.to_lowercase();
    let keyword_character = KEYWORDS
        .iter()
        .filter_map(|keyword| lower.find(keyword))
        .min()
        .map(|byte_index| text[..byte_index].chars().count())
        .unwrap_or(0);
    let start = keyword_character.saturating_sub(CONTEXT_CHARS);
    let end = (start + MAX_QUOTE_CHARS).min(characters.len());
    let prefix_start = start.saturating_sub(CONTEXT_CHARS);
    let suffix_end = (end + CONTEXT_CHARS).min(characters.len());
    (
        characters[prefix_start..start].iter().collect(),
        characters[start..end]
            .iter()
            .collect::<String>()
            .trim()
            .to_owned(),
        characters[end..suffix_end].iter().collect(),
    )
}

fn anchor_id(attachment_id: &str, sha256: &str, page_index: i64, quote: &str) -> String {
    let identity =
        format!("{RETRIEVAL_CONFIG_VERSION}:{attachment_id}:{sha256}:{page_index}:{quote}");
    format!("ai-overview-{:x}", Sha256::digest(identity.as_bytes()))
}

pub fn citation_key(ordinal: usize) -> String {
    format!("ev-page-{}", ordinal + 1)
}

pub fn context(source: &OverviewPageEvidence) -> String {
    format!(
        "{}{}{}",
        source.quote_prefix, source.quote_exact, source.quote_suffix
    )
}

pub fn prepare_rows(sources: &[OverviewPageEvidence]) -> Vec<PreparedPageEvidence> {
    sources
        .iter()
        .enumerate()
        .map(|(ordinal, source)| PreparedPageEvidence {
            source: source.clone(),
            citation_key: citation_key(ordinal),
            context: context(source),
        })
        .collect()
}
