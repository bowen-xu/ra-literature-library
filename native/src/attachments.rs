//! Canonical name/reading-state rules; Core keeps all byte, SQL and clock owners.
use research_workbench_native_sdk::{
    attachments::{
        AttachmentPlanV1, AttachmentPreparationV1, AttachmentPrepareInputV1, AttachmentRejectionV1,
    },
    duplicate_review::F64BitsV1,
};

pub fn validate_name(name: &str) -> Result<&str, AttachmentRejectionV1> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 255 || name.chars().any(char::is_control) {
        return Err(AttachmentRejectionV1::InvalidAttachmentName);
    }
    Ok(name)
}

pub fn valid_reader_view_state(value: &serde_json::Value) -> bool {
    let page_valid = matches!(
        value.get("pageIndex").and_then(serde_json::Value::as_i64),
        Some(page) if page >= 0
    );
    let scale_valid = value.get("scale").is_some_and(|scale| {
        let kind = scale.get("kind").and_then(serde_json::Value::as_str);
        match kind {
            Some("numeric") => scale
                .get("value")
                .and_then(serde_json::Value::as_f64)
                .is_some_and(|number| (0.5..=3.0).contains(&number)),
            Some("page-fit" | "page-width" | "page-height" | "auto") => true,
            _ => false,
        }
    });
    value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_i64)
        == Some(2)
        && page_valid
        && scale_valid
        && matches!(
            value.get("scrollMode").and_then(serde_json::Value::as_str),
            Some("vertical" | "horizontal" | "wrapped" | "page")
        )
        && matches!(
            value.get("spreadMode").and_then(serde_json::Value::as_str),
            Some("none" | "odd" | "even")
        )
}

/// Keep the original JSON check before finite checking and clamping. The caller
/// persists its unchanged optional JSON string and original SQL page operand.
pub fn prepare_reading_state(
    zoom: f64,
    view_state_json: Option<&str>,
) -> Result<f64, AttachmentRejectionV1> {
    if let Some(json) = view_state_json {
        let value: serde_json::Value = serde_json::from_str(json)
            .map_err(|_| AttachmentRejectionV1::InvalidReaderViewState)?;
        if !valid_reader_view_state(&value) {
            return Err(AttachmentRejectionV1::InvalidReaderViewState);
        }
    }
    if !zoom.is_finite() {
        return Err(AttachmentRejectionV1::InvalidReaderViewState);
    }
    Ok(zoom.clamp(0.5, 3.0))
}

pub fn prepare(input: AttachmentPrepareInputV1) -> AttachmentPreparationV1 {
    let plan =
        match &input {
            AttachmentPrepareInputV1::Rename { request } => validate_name(&request.display_name)
                .map(|display_name| AttachmentPlanV1::Rename {
                    request: request.clone(),
                    display_name: display_name.to_owned(),
                }),
            AttachmentPrepareInputV1::SaveReadingState { request } => {
                prepare_reading_state(request.zoom.to_f64(), request.view_state_json.as_deref())
                    .map(|bounded_zoom| AttachmentPlanV1::SaveReadingState {
                        request: request.clone(),
                        bounded_zoom: F64BitsV1::from_f64(bounded_zoom),
                    })
            }
        };
    match plan {
        Ok(plan) => AttachmentPreparationV1::Ready {
            plan: Box::new(plan),
        },
        Err(reason) => AttachmentPreparationV1::Rejected {
            input: Box::new(input),
            reason,
        },
    }
}

#[cfg(test)]
mod tests;
