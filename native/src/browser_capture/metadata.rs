use super::*;
use std::collections::HashSet;

pub(super) fn capture(
    scope: &str,
    payload: &Value,
    operation: &str,
    items: &[Value],
    doi: &[PreparedDoi],
) -> Result<PreparedCaptureV1, CaptureRejectionV1> {
    validate_scope(scope)?;
    let payload_json = validate_metadata(payload)?;
    let session_id = identifier(&payload["sessionID"])?;
    let mut uri = text(payload, "uri")?;
    if uri.is_empty() {
        uri = text(payload, "url")?;
    }
    let translator_id = text(payload, "translatorID")?;
    let translator_version = text(payload, "translatorVersion")?;
    if uri.len() > 8192 || translator_id.len() > 256 || translator_version.len() > 256 {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    if items.is_empty() || items.len() > 128 || doi.len() != items.len() {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    let mut external_ids = HashSet::new();
    let mut drafts = Vec::with_capacity(items.len());
    for item in items {
        let external_id = identifier(&item["id"])?;
        if !external_ids.insert(external_id.clone()) {
            return Err(CaptureRejectionV1::InvalidInput);
        }
        drafts.push((external_id, draft_from_capture(item)?));
    }
    let request_sha256 = digest(format!("{operation}:{payload_json}").as_bytes());
    let mut prepared = Vec::with_capacity(items.len());
    for (((external_id, draft), raw), doi) in drafts.into_iter().zip(items).zip(doi) {
        let original_type = text(raw, "itemType")?;
        let stored_type = draft.item_type.clone();
        let title = draft.title.trim().to_owned();
        let save = crate::catalog_save::prepare(CatalogSaveInput {
            draft,
            doi: doi.clone(),
        });
        let source_reference = json!({"captureSessionID":session_id,"externalItemID":external_id,
            "uri":uri,"translatorID":translator_id,"translatorVersion":translator_version});
        let warnings = if original_type == stored_type {
            Vec::new()
        } else {
            vec![
                json!({"code":"unsupported_item_type","originalItemType":original_type.clone(),"storedItemType":stored_type}),
            ]
        };
        prepared.push(PreparedCaptureItemV1 {
            external_id,
            raw: raw.clone(),
            save,
            identifiers: identifiers(raw),
            source_reference,
            receipt: CaptureItemReceiptFieldsV1 {
                id: raw["id"].clone(),
                item_type: stored_type,
                title,
                warnings,
            },
        });
    }
    Ok(PreparedCaptureV1 {
        session_id,
        operation: operation.into(),
        payload_json,
        request_sha256,
        items: prepared,
    })
}

fn identifiers(raw: &Value) -> Vec<Result<CaptureIdentifierV1, CaptureRejectionV1>> {
    [
        ("ISBN", "isbn"),
        ("ISSN", "issn"),
        ("PMID", "pmid"),
        ("arXiv", "arxiv"),
    ]
    .into_iter()
    .filter_map(|(field, kind)| match text(raw, field) {
        Err(error) => Some(Err(error)),
        Ok(value) if value.trim().is_empty() => None,
        Ok(value) => {
            let normalized: String = value
                .chars()
                .filter(|c| !c.is_whitespace() && *c != '-')
                .collect();
            Some(Ok(CaptureIdentifierV1 {
                kind: kind.into(),
                normalized: normalized.to_lowercase(),
                display: value,
            }))
        }
    })
    .collect()
}
