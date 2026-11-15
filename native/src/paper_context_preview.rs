//! The original preview policy over owned observations, without SQL or file access.
use research_workbench_native_sdk::{
    paper_context::SnapshotDigestInputV1,
    paper_context_preview::{
        PaperContextError as Error, PaperContextPreview, PaperContextPreviewDecisionV1 as Decision,
        PaperContextPreviewInputV1 as Input, PaperContextPreviewItem, PaperContextRequest, hash,
        identity,
    },
};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
pub const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_ITEMS: usize = 20_000;

pub fn evaluate(input: Input) -> Decision {
    let result = match input {
        Input::Header { request, header } => validate_header(&request, header).map(|()| None),
        Input::Preflight {
            item_count,
            item_bytes,
            invalid_page_count,
            attachment_count,
            attachment_bytes,
        } => validate_preflight(
            item_count,
            item_bytes,
            invalid_page_count,
            attachment_count,
            attachment_bytes,
        )
        .map(|()| None),
        Input::Snapshot { request, snapshot } => preview(&request, snapshot).map(Some),
    };
    match result {
        Ok(None) => Decision::Validated {},
        Ok(Some(preview)) => Decision::Previewed { preview },
        Err(error) => Decision::Rejected { error },
    }
}

pub fn validate_header(
    request: &PaperContextRequest,
    header: Option<(String, String, i64)>,
) -> Result<(), Error> {
    request.validate()?;
    let (paper, digest, version) = header.ok_or(Error::Unavailable)?;
    if paper != request.paper_id || digest != request.expected_context_hash {
        return Err(Error::Conflict);
    }
    if version != 1 {
        return Err(Error::Corrupt);
    }
    Ok(())
}

pub fn validate_preflight(
    count: usize,
    bytes: usize,
    invalid: usize,
    attachments: usize,
    attachment_bytes: usize,
) -> Result<(), Error> {
    if attachments > 64 || count > MAX_ITEMS || bytes.saturating_add(attachment_bytes) > MAX_BYTES {
        return Err(Error::Budget);
    }
    if invalid != 0 || attachments == 0 {
        return Err(Error::Corrupt);
    }
    Ok(())
}

pub fn preview(
    request: &PaperContextRequest,
    snapshot: SnapshotDigestInputV1,
) -> Result<PaperContextPreview, Error> {
    if crate::paper_context_snapshot::digest(&snapshot).map_err(|_| Error::Corrupt)?
        != request.expected_context_hash
    {
        return Err(Error::Corrupt);
    }
    let mut attachments = HashMap::new();
    for (ordinal, attachment) in snapshot.attachments.iter().enumerate() {
        if attachment.ordinal != ordinal as i64
            || !identity(&attachment.attachment_id)
            || !identity(&attachment.parse_run_id)
            || !hash(&attachment.content_sha256)
            || attachments
                .insert(attachment.attachment_id.as_str(), attachment)
                .is_some()
        {
            return Err(Error::Corrupt);
        }
    }
    let mut sources = HashSet::new();
    let mut items = Vec::with_capacity(snapshot.items.len());
    for item in snapshot.items {
        let attachment = attachments
            .get(item.attachment_id.as_str())
            .ok_or(Error::Corrupt)?;
        if item.content_sha256 != attachment.content_sha256
            || item.parse_run_id != attachment.parse_run_id
            || !identity(&item.id)
            || item.id.len() > 80
            || item.regions.len() > MAX_ITEMS
            || !matches!(
                item.kind.as_str(),
                "text"
                    | "table"
                    | "picture"
                    | "group"
                    | "key_value"
                    | "form"
                    | "field"
                    | "field_region"
            )
            || !identity(&item.raw_ref)
            || item.charspan.is_some_and(|span| span[0] > span[1])
            || item
                .image_content_sha256
                .as_deref()
                .is_some_and(|value| !hash(value))
            || item
                .source_text_hash
                .as_deref()
                .is_some_and(|value| !hash(value))
        {
            return Err(Error::Corrupt);
        }
        for region in &item.regions {
            let rect = &region.rect;
            if ![rect.x, rect.y, rect.width, rect.height]
                .iter()
                .all(|value| value.is_finite())
                || rect.x < 0.0
                || rect.y < 0.0
                || rect.width <= 0.0
                || rect.height <= 0.0
                || rect.x + rect.width > 1.000001
                || rect.y + rect.height > 1.000001
            {
                return Err(Error::Corrupt);
            }
        }
        let identity = serde_json::to_vec(&(
            &request.paper_id,
            &item.attachment_id,
            &item.content_sha256,
            &item.parse_run_id,
            &item.kind,
            &item.raw_ref,
        ))
        .map_err(|_| Error::Corrupt)?;
        let source_id = format!("paper-source:{:x}", Sha256::digest(identity));
        if !sources.insert(source_id.clone()) {
            return Err(Error::Corrupt);
        }
        items.push(PaperContextPreviewItem { source_id, item });
    }
    let preview = PaperContextPreview {
        schema_version: 1,
        paper_id: request.paper_id.clone(),
        snapshot_id: request.snapshot_id.clone(),
        context_hash: request.expected_context_hash.clone(),
        attachments: snapshot.attachments,
        items,
    };
    if serde_json::to_vec(&preview)
        .map_err(|_| Error::Corrupt)?
        .len()
        > MAX_BYTES
    {
        return Err(Error::Budget);
    }
    Ok(preview)
}
