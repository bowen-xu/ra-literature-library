use super::*;

fn validate_pdf(
    scope: &str,
    session_id: &str,
    metadata: &Value,
    pdf: &PdfObservationV1,
) -> Result<String, CaptureRejectionV1> {
    validate_scope(scope)?;
    identifier(&json!(session_id))?;
    let metadata_json = validate_metadata(metadata)?;
    if pdf.byte_size > MAX_PDF_BYTES
        || !pdf.starts_with_pdf
        || text(metadata, "contentType")?
            .split(';')
            .next()
            .map(str::trim)
            != Some("application/pdf")
    {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    decoded_title(metadata)?;
    if text(metadata, "url")?.len() > 8192 {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    Ok(metadata_json)
}
fn attachment_digest(metadata_json: &str, pdf: &PdfObservationV1) -> String {
    digest(format!("{metadata_json}:{}", pdf.sha256).as_bytes())
}

pub(super) fn attachment(
    scope: &str,
    session_id: &str,
    metadata: &Value,
    pdf: &PdfObservationV1,
) -> Result<PreparedCaptureAttachmentV1, CaptureRejectionV1> {
    let metadata_json = validate_pdf(scope, session_id, metadata, pdf)?;
    let external_id = identifier(&metadata["id"])?;
    let parent_external_id = identifier(&metadata["parentItemID"])?;
    Ok(PreparedCaptureAttachmentV1 {
        original_id: metadata["id"].clone(),
        session_id: session_id.into(),
        external_id,
        parent_external_id,
        request_sha256: attachment_digest(&metadata_json, pdf),
        metadata_json,
        display_name: decoded_title(metadata)?,
        source_url: text(metadata, "url")?,
    })
}

pub(super) fn standalone(
    scope: &str,
    session_id: &str,
    metadata: &Value,
    pdf: &PdfObservationV1,
) -> Result<PreparedStandaloneCaptureV1, CaptureRejectionV1> {
    let metadata_json = validate_pdf(scope, session_id, metadata, pdf)?;
    let request_sha256 =
        digest(format!("standalone:{}", attachment_digest(&metadata_json, pdf)).as_bytes());
    let title = decoded_title(metadata)?;
    let raw = json!({"id":"standalone","itemType":"document","title":title,"url":metadata["url"],"metadataPending":true});
    let save = crate::catalog_save::prepare(CatalogSaveInput {
        draft: draft_from_capture(&raw)?,
        doi: empty_doi(),
    });
    let source_reference =
        json!({"captureSessionID":session_id,"uri":metadata["url"],"source":"standalone_pdf"});
    Ok(PreparedStandaloneCaptureV1 {
        attachment: PreparedCaptureAttachmentV1 {
            original_id: metadata["id"].clone(),
            session_id: session_id.into(),
            external_id: "standalone".into(),
            parent_external_id: String::new(),
            metadata_json,
            request_sha256,
            display_name: title,
            source_url: text(metadata, "url")?,
        },
        save,
        raw,
        source_reference,
    })
}
