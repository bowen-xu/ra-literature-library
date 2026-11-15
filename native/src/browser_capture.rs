//! Original browser-capture rules over owned input, without sockets, SQL or files.
pub use research_workbench_native_sdk::browser_capture::*;
use research_workbench_native_sdk::catalog_save::{CatalogSaveInput, PreparedDoi};
use serde_json::{Value, json};
mod draft;
mod metadata;
mod pdf;
mod resources;
mod title;
mod values;
pub use draft::draft_from_capture;
pub use resources::static_sql;
pub use title::decoded_title;
pub use values::{digest, identifier, text, validate_metadata, validate_scope};

pub fn prepare(input: BrowserCaptureInputV1) -> BrowserCapturePreparationV1 {
    match prepare_checked(input) {
        Ok(prepared) => prepared,
        Err(reason) => BrowserCapturePreparationV1::Rejected { reason },
    }
}

fn prepare_checked(
    input: BrowserCaptureInputV1,
) -> Result<BrowserCapturePreparationV1, CaptureRejectionV1> {
    use BrowserCaptureInputV1 as Input;
    use BrowserCapturePreparationV1 as Prepared;
    match input {
        Input::Items {
            scope,
            payload,
            doi,
        } => {
            let items = payload["items"]
                .as_array()
                .ok_or(CaptureRejectionV1::InvalidInput)?;
            metadata::capture(&scope, &payload, "items", items, &doi).map(|plan| {
                Prepared::Capture {
                    plan: Box::new(plan),
                }
            })
        }
        Input::Snapshot { scope, payload } => {
            if payload["pdf"] == true {
                return Err(CaptureRejectionV1::Unsupported);
            }
            let item = json!({"id":"webpage","itemType":"webpage","title":payload["title"],
                "url":payload["url"],"creators":[],"tags":[]});
            metadata::capture(&scope, &payload, "webpage", &[item], &[empty_doi()]).map(|plan| {
                Prepared::Capture {
                    plan: Box::new(plan),
                }
            })
        }
        Input::Attachment {
            scope,
            session_id,
            metadata,
            pdf,
        } => pdf::attachment(&scope, &session_id, &metadata, &pdf)
            .map(|plan| Prepared::Attachment { plan }),
        Input::Standalone {
            scope,
            session_id,
            metadata,
            pdf,
        } => {
            pdf::standalone(&scope, &session_id, &metadata, &pdf).map(|plan| Prepared::Standalone {
                plan: Box::new(plan),
            })
        }
        Input::SessionStatus { scope, session_id } => {
            validate_scope(&scope)?;
            identifier(&json!(session_id))?;
            Ok(Prepared::Session {
                session_id,
                projection: SessionProjectionV1::Full,
            })
        }
        Input::UpdateSession { scope, payload } => {
            validate_metadata(&payload)?;
            let session_id = identifier(&payload["sessionID"])?;
            if payload
                .get("target")
                .is_some_and(|target| !target.is_null() && target != "L1")
                || payload
                    .get("tags")
                    .is_some_and(|tags| tags != "" && tags != &json!([]) && !tags.is_null())
                || payload
                    .get("note")
                    .is_some_and(|note| note != "" && !note.is_null())
                || payload.as_object().is_some_and(|fields| {
                    fields.keys().any(|key| {
                        !matches!(key.as_str(), "sessionID" | "target" | "tags" | "note")
                    })
                })
            {
                return Err(CaptureRejectionV1::Unsupported);
            }
            validate_scope(&scope)?;
            Ok(Prepared::Session {
                session_id,
                projection: SessionProjectionV1::SessionId,
            })
        }
        Input::RecognizedItem { scope, payload } => {
            validate_metadata(&payload)?;
            let session_id = identifier(&payload["sessionID"])?;
            validate_scope(&scope)?;
            Ok(Prepared::Session {
                session_id,
                projection: SessionProjectionV1::Null,
            })
        }
        Input::SelectedLibrary {} => Ok(Prepared::Value { value: library() }),
        Input::ClientHostnames {} => Ok(Prepared::Value { value: json!([]) }),
        Input::DelaySync {} => Ok(Prepared::Value {
            value: json!({"sync":false}),
        }),
        Input::AttachmentResolvers {} => Ok(Prepared::Value {
            value: json!(false),
        }),
        Input::Unsupported {} => Err(CaptureRejectionV1::Unsupported),
    }
}

fn empty_doi() -> PreparedDoi {
    PreparedDoi {
        display: String::new(),
        normalized: String::new(),
    }
}

pub fn library() -> Value {
    json!({"id":"L1","name":"Research Assistant 文献库", "libraryID":1,
        "libraryEditable":true,"filesEditable":true,
        "targets":[{"id":"L1","name":"Research Assistant 文献库","level":0,
        "libraryID":1,"libraryEditable":true,"filesEditable":true}],"tags":{}})
}

#[cfg(test)]
mod tests;
