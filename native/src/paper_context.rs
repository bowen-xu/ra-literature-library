//! Original Docling context interpretation over supplied facts only.
use research_workbench_native_sdk::paper_context::*;
use serde_json::Value;
use sha2::{Digest, Sha256};

fn hash_text(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
const ITEM_COLLECTIONS: &[(&str, &str, &str)] = &[
    ("texts", "text", "T"),
    ("tables", "table", "TABLE"),
    ("pictures", "picture", "F"),
    ("groups", "group", "G"),
    ("key_value_items", "key_value", "KV"),
    ("form_items", "form", "FORM"),
    ("field_items", "field", "FIELD"),
    ("field_regions", "field_region", "REGION"),
];

pub fn build(input: &PaperContextBuildInputV1) -> PreparedPaperContextV1 {
    let mut attachment_statuses = Vec::new();
    let mut context_items = Vec::new();
    for (attachment_index, attachment) in input.attachments.iter().enumerate() {
        match &attachment.parse {
            Some(run) => {
                attachment_statuses.push(PaperAiReadingAttachmentStatus {
                    attachment_id: attachment.id.clone(),
                    display_name: attachment.display_name.clone(),
                    content_sha256: attachment.content_sha256.clone(),
                    parse_run_id: Some(run.id.clone()),
                    parse_status: "available".to_owned(),
                });
                context_items.extend(build_context_items(
                    &input.paper_id,
                    &attachment.id,
                    &attachment.content_sha256,
                    run,
                    attachment_index + 1,
                ));
            }
            None => attachment_statuses.push(PaperAiReadingAttachmentStatus {
                attachment_id: attachment.id.clone(),
                display_name: attachment.display_name.clone(),
                content_sha256: attachment.content_sha256.clone(),
                parse_run_id: None,
                parse_status: if attachment.has_stale_parse {
                    "stale"
                } else {
                    "missing"
                }
                .to_owned(),
            }),
        }
    }
    let image_requests = context_items
        .iter()
        .filter(|item| item.kind == "picture")
        .filter_map(|item| {
            Some(PaperAiReadingImageRequest {
                context_item_id: item.id.clone(),
                attachment_id: item.attachment_id.clone(),
                page_index: item.page_index?,
                regions: item.regions.clone(),
                label: item.label.clone(),
            })
        })
        .collect::<Vec<_>>();
    let text_item_count = context_items
        .iter()
        .filter(|item| item.kind == "text")
        .count();
    let table_item_count = context_items
        .iter()
        .filter(|item| item.kind == "table")
        .count();
    let picture_item_count = context_items
        .iter()
        .filter(|item| item.kind == "picture")
        .count();
    PreparedPaperContextV1 {
        attachment_statuses,
        context_items,
        image_requests,
        text_item_count,
        table_item_count,
        picture_item_count,
    }
}
fn build_context_items(
    paper_id: &str,
    attachment_id: &str,
    content_sha256: &str,
    run: &ContextParseRunV1,
    attachment_ordinal: usize,
) -> Vec<PaperAiReadingContextItem> {
    let document = &run.json_content;
    let mut items = Vec::new();
    for (collection_name, fallback_kind, prefix) in ITEM_COLLECTIONS {
        let mut ordinal = 0_usize;
        let Some(collection) = document.get(*collection_name).and_then(Value::as_array) else {
            continue;
        };
        for (index, item) in collection.iter().enumerate() {
            let regions = item_regions(document, item);
            if regions.is_empty() {
                continue;
            }
            ordinal += 1;
            let raw_ref = item
                .get("self_ref")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("#/{collection_name}/{index}"));
            let label = item
                .get("label")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let text = text_content(item);
            let source_hash_material = text
                .clone()
                .or_else(|| item.get("data").map(Value::to_string));
            items.push(PaperAiReadingContextItem {
                id: format!("P{attachment_ordinal}-{prefix}{ordinal}"),
                paper_id: paper_id.to_owned(),
                attachment_id: attachment_id.to_owned(),
                content_sha256: content_sha256.to_owned(),
                parse_run_id: run.id.clone(),
                raw_ref,
                kind: (*fallback_kind).to_owned(),
                label,
                page_index: regions.first().map(|region| region.page_index),
                regions,
                charspan: charspan(item),
                source_text_hash: source_hash_material.as_ref().map(|value| hash_text(value)),
                text,
                table_json: (*fallback_kind == "table")
                    .then(|| item.get("data").cloned().unwrap_or_else(|| item.clone())),
            });
        }
    }
    items
}

fn item_regions(document: &Value, item: &Value) -> Vec<PaperAiReadingRegion> {
    let Some(provenance) = item.get("prov").and_then(Value::as_array) else {
        return Vec::new();
    };
    provenance
        .iter()
        .filter_map(|entry| {
            let page_no = entry.get("page_no").and_then(Value::as_u64)?;
            let page_index = u32::try_from(page_no.checked_sub(1)?).ok()?;
            let rect = normalize_bbox(entry.get("bbox")?, page_size(document, page_index)?)?;
            Some(PaperAiReadingRegion { page_index, rect })
        })
        .collect()
}

fn page_size(document: &Value, page_index: u32) -> Option<(f64, f64)> {
    let page_no = u64::from(page_index) + 1;
    let pages = document.get("pages")?;
    let page = if let Some(page) = pages.get(page_no.to_string()) {
        page
    } else if let Some(array) = pages.as_array() {
        array
            .iter()
            .find(|page| page.get("page_no").and_then(Value::as_u64) == Some(page_no))?
    } else {
        pages
            .as_object()?
            .values()
            .find(|page| page.get("page_no").and_then(Value::as_u64) == Some(page_no))?
    };
    let size = page.get("size")?;
    Some((size.get("width")?.as_f64()?, size.get("height")?.as_f64()?))
}

fn normalize_bbox(bbox: &Value, page_size: (f64, f64)) -> Option<PaperAiReadingRect> {
    let (page_width, page_height) = page_size;
    if page_width <= 0.0 || page_height <= 0.0 {
        return None;
    }
    let left = bbox.get("l")?.as_f64()?;
    let top = bbox.get("t")?.as_f64()?;
    let right = bbox.get("r")?.as_f64()?;
    let bottom = bbox.get("b")?.as_f64()?;
    if [left, top, right, bottom]
        .iter()
        .any(|value| !value.is_finite())
    {
        return None;
    }
    let x0 = left.min(right);
    let x1 = left.max(right);
    let y0 = top.min(bottom);
    let y1 = top.max(bottom);
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    let y = if bbox
        .get("coord_origin")
        .and_then(Value::as_str)
        .unwrap_or("TOPLEFT")
        == "BOTTOMLEFT"
    {
        (page_height - y1) / page_height
    } else {
        y0 / page_height
    };
    clamp_rect(PaperAiReadingRect {
        x: x0 / page_width,
        y,
        width: (x1 - x0) / page_width,
        height: (y1 - y0) / page_height,
    })
}

fn clamp_rect(rect: PaperAiReadingRect) -> Option<PaperAiReadingRect> {
    let x0 = rect.x.clamp(0.0, 1.0);
    let y0 = rect.y.clamp(0.0, 1.0);
    let x1 = (rect.x + rect.width).clamp(0.0, 1.0);
    let y1 = (rect.y + rect.height).clamp(0.0, 1.0);
    (x1 > x0 && y1 > y0).then_some(PaperAiReadingRect {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
    })
}

fn text_content(item: &Value) -> Option<String> {
    let value = item
        .get("text")
        .or_else(|| item.get("orig"))
        .and_then(Value::as_str)
        .or_else(|| item.pointer("/data/text").and_then(Value::as_str))?;
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    (!normalized.is_empty()).then_some(normalized)
}

fn charspan(item: &Value) -> Option<[u32; 2]> {
    let span = item
        .get("prov")?
        .as_array()?
        .first()?
        .get("charspan")?
        .as_array()?;
    Some([
        u32::try_from(span.first()?.as_u64()?).ok()?,
        u32::try_from(span.get(1)?.as_u64()?).ok()?,
    ])
}

#[cfg(test)]
mod tests;
