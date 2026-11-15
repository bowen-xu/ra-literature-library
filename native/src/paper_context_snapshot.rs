//! Original snapshot projection and canonical digest over pure paper-context DTOs.
use research_workbench_native_sdk::paper_context::*;
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const CONTEXT_SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PaperContextProjectionError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("reading support temporarily unavailable")]
    TemporaryUnavailable,
}

fn hash_text(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

pub fn project(
    input: &SnapshotProjectionInputV1,
) -> Result<SnapshotProjectionV1, PaperContextProjectionError> {
    if !crate::paper_context_prepare::snapshot_ready(&input.attachment_statuses) {
        return Err(PaperContextProjectionError::InvalidInput(
            "只有完成 Docling 解析的附件才能冻结论文上下文".to_owned(),
        ));
    }
    let attachments = input
        .attachment_statuses
        .iter()
        .enumerate()
        .map(|(ordinal, status)| PaperContextAttachment {
            attachment_id: status.attachment_id.clone(),
            content_sha256: status.content_sha256.clone(),
            parse_run_id: status.parse_run_id.clone().unwrap_or_default(),
            ordinal: i64::try_from(ordinal).unwrap_or(i64::MAX),
        })
        .collect::<Vec<_>>();
    let mut items = input
        .context_items
        .iter()
        .map(|item| PaperContextItem {
            id: item.id.clone(),
            attachment_id: item.attachment_id.clone(),
            content_sha256: item.content_sha256.clone(),
            parse_run_id: item.parse_run_id.clone(),
            raw_ref: item.raw_ref.clone(),
            kind: item.kind.clone(),
            label: item.label.clone(),
            page_index: item.page_index,
            regions: item.regions.clone(),
            charspan: item.charspan,
            source_text_hash: item.source_text_hash.clone(),
            text: item.text.clone(),
            table_json: item.table_json.clone(),
            image_content_sha256: input.image_hashes.get(&item.id).cloned(),
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| left.id.cmp(&right.id));
    let context_hash = digest(&SnapshotDigestInputV1 {
        context_schema_version: CONTEXT_SCHEMA_VERSION,
        paper_id: input.paper_id.clone(),
        attachments: attachments.clone(),
        items: items.clone(),
    })?;
    Ok(SnapshotProjectionV1 {
        context_schema_version: CONTEXT_SCHEMA_VERSION,
        attachments,
        items,
        snapshot_id: format!("paper-context-{context_hash}"),
        context_hash,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanonicalContext<'a> {
    context_schema_version: i64,
    paper_id: &'a str,
    attachments: &'a [PaperContextAttachment],
    items: &'a [PaperContextItem],
}

const REGION_COORDINATE_DECIMALS: f64 = 1_000_000_000_000.0;

fn canonical_items(items: &[PaperContextItem]) -> Vec<PaperContextItem> {
    items
        .iter()
        .cloned()
        .map(|mut item| {
            for region in &mut item.regions {
                region.rect.x = (region.rect.x * REGION_COORDINATE_DECIMALS).round()
                    / REGION_COORDINATE_DECIMALS;
                region.rect.y = (region.rect.y * REGION_COORDINATE_DECIMALS).round()
                    / REGION_COORDINATE_DECIMALS;
                region.rect.width = (region.rect.width * REGION_COORDINATE_DECIMALS).round()
                    / REGION_COORDINATE_DECIMALS;
                region.rect.height = (region.rect.height * REGION_COORDINATE_DECIMALS).round()
                    / REGION_COORDINATE_DECIMALS;
            }
            item
        })
        .collect()
}

pub fn canonical_json(
    input: &SnapshotDigestInputV1,
) -> Result<String, PaperContextProjectionError> {
    let canonical_items = canonical_items(&input.items);
    let canonical = CanonicalContext {
        context_schema_version: input.context_schema_version,
        paper_id: &input.paper_id,
        attachments: &input.attachments,
        items: &canonical_items,
    };
    serde_json::to_string(&canonical).map_err(|_| PaperContextProjectionError::TemporaryUnavailable)
}

pub fn digest(input: &SnapshotDigestInputV1) -> Result<String, PaperContextProjectionError> {
    Ok(hash_text(&canonical_json(input)?))
}

#[cfg(test)]
mod tests;
