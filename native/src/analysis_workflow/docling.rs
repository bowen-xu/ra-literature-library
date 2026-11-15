//! Original Docling quote, context and evidence-row interpretation.
use research_workbench_native_sdk::{
    analysis_workflow::{AnalysisWorkflowError, docling::DoclingEvidenceRow},
    paper_context::PaperAiReadingContextItem,
};

pub const EXISTING_SQL: &str = include_str!("../../data/analysis-docling-evidence-existing.v1.sql");
pub const TITLE_SQL: &str = include_str!("../../data/analysis-docling-evidence-title.v1.sql");
pub const BUNDLE_SQL: &str = include_str!("../../data/analysis-docling-evidence-bundle.v1.sql");
pub const ANCHOR_SQL: &str = include_str!("../../data/analysis-docling-evidence-anchor.v1.sql");
pub const ITEM_SQL: &str = include_str!("../../data/analysis-docling-evidence-item.v1.sql");
pub const CONTEXT_SQL: &str = include_str!("../../data/analysis-docling-evidence-context.v1.sql");

/// Interpret exactly one item immediately before its fixed projection. Items
/// without a page contribute no anchor/evidence row; no later item is inspected.
pub fn evidence_row(
    run: &str,
    item: &PaperAiReadingContextItem,
) -> Result<Option<DoclingEvidenceRow>, AnalysisWorkflowError> {
    let Some(page) = item
        .regions
        .first()
        .map(|region| region.page_index)
        .or(item.page_index)
    else {
        return Ok(None);
    };
    let anchor_id = format!("docling:{run}:{}", item.id);
    let rects_json = serde_json::to_string(
        &item
            .regions
            .iter()
            .filter(|region| region.page_index == page)
            .map(|region| &region.rect)
            .collect::<Vec<_>>(),
    )
    .map_err(|_| AnalysisWorkflowError::TemporaryUnavailable)?;
    Ok(Some(DoclingEvidenceRow {
        anchor_id,
        page_index: i64::from(page),
        page_label: (page + 1).to_string(),
        rects_json,
        quote: quote_for_item(item),
        context: context_for_item(item),
    }))
}
use serde_json::Value;

pub fn quote_for_item(item: &PaperAiReadingContextItem) -> String {
    item.text
        .as_ref()
        .cloned()
        .or_else(|| item.label.clone())
        .or_else(|| item.table_json.as_ref().map(Value::to_string))
        .unwrap_or_else(|| format!("Docling {} block {}", item.kind, item.id))
        .chars()
        .take(6_000)
        .collect()
}

pub fn context_for_item(item: &PaperAiReadingContextItem) -> String {
    let mut value = format!(
        "[{}] kind={} page={} rawRef={}",
        item.id,
        item.kind,
        item.page_index.map(|page| page + 1).unwrap_or(0),
        item.raw_ref
    );
    if let Some(label) = &item.label {
        value.push_str(&format!(" label={label}"));
    }
    if let Some(text) = &item.text {
        value.push_str(&format!(" text={text}"));
    }
    if let Some(table) = &item.table_json {
        value.push_str(&format!(" table={table}"));
    }
    value.chars().take(12_000).collect()
}

/// Original legacy extraction validation, retaining its distinct diagnostic text.
pub fn validate_start(
    revision: i64,
    has_template: bool,
) -> Result<(), super::AnalysisWorkflowError> {
    if revision < 1 && !has_template {
        return Err(super::AnalysisWorkflowError::InvalidInput(
            "阅读框架尚未确认，无法启动 AI 提取".into(),
        ));
    }
    Ok(())
}
pub fn validate_sources(
    statuses: &[String],
    picture_count: usize,
) -> Result<(), super::AnalysisWorkflowError> {
    if statuses.iter().any(|status| status != "available") {
        return Err(super::AnalysisWorkflowError::InvalidInput(
            "部分 PDF 尚未完成 Docling 结构化解析".into(),
        ));
    }
    if picture_count > 128 {
        return Err(super::AnalysisWorkflowError::InvalidInput(format!(
            "图片结构块数量为 {picture_count}，超过本轮上限 128；请等待分批发送能力接入"
        )));
    }
    Ok(())
}
