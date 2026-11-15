use super::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    catalog_save::CatalogSaveOutcome,
};

fn payload() -> Value {
    json!({"sessionID":"capture","uri":"https://example.org/paper","translatorID":"fixture","translatorVersion":"1",
        "items":[{"id":18446744073709551615u64,"itemType":"journalArticle","title":"  Ω Paper  ","DOI":"10.1234/example",
            "date":"2026-11-13","publicationTitle":"Fixture Journal","ISBN":"978-1 234","creators":[{"name":"Fixture Consortium","creatorType":"contributor"}],
            "tags":[{"tag":"Tag"},{"tag":"TAG"}],"extra":"Retain original"}]})
}
fn input(payload: Value) -> BrowserCaptureInputV1 {
    let doi = payload["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|_| PreparedDoi {
            display: "10.1234/example".into(),
            normalized: "10.1234/example".into(),
        })
        .collect();
    BrowserCaptureInputV1::Items {
        scope: "receiver".into(),
        payload,
        doi,
    }
}
fn capture(payload: Value) -> PreparedCaptureV1 {
    let BrowserCapturePreparationV1::Capture { plan } = prepare(input(payload)) else {
        panic!("capture plan");
    };
    *plan
}
fn pdf() -> PdfObservationV1 {
    PdfObservationV1 {
        byte_size: 42,
        starts_with_pdf: true,
        sha256: "b".repeat(64),
    }
}
fn metadata() -> Value {
    json!({"id":"pdf","parentItemID":"parent","title":"=?UTF-8?Q?Full_Text_=CE=A9?=","url":"https://example.org/p.pdf","contentType":"application/pdf"})
}

#[test]
fn full_metadata_keeps_raw_identity_provenance_and_original_catalog_projection() {
    let raw = payload();
    let plan = capture(raw.clone());
    assert_eq!(plan.payload_json, raw.to_string());
    assert_eq!(
        plan.request_sha256,
        digest(format!("items:{}", raw).as_bytes())
    );
    let item = &plan.items[0];
    assert_eq!(item.raw, raw["items"][0]);
    assert_eq!(item.receipt.id, raw["items"][0]["id"]);
    assert_eq!(item.receipt.title, "Ω Paper");
    assert!(item.receipt.warnings.is_empty());
    assert_eq!(
        item.source_reference,
        json!({"captureSessionID":"capture","externalItemID":"18446744073709551615","uri":"https://example.org/paper","translatorID":"fixture","translatorVersion":"1"})
    );
    let CatalogSaveOutcome::Planned { plan } = &item.save else {
        panic!("catalog plan");
    };
    assert_eq!(plan.item.issued_year, Some(2026));
    assert_eq!(plan.creators[0].literal_name, "Fixture Consortium");
    assert_eq!(plan.tags, vec!["Tag"]);
    let identifier = item.identifiers[0].as_ref().unwrap();
    assert_eq!(
        (
            identifier.kind.as_str(),
            identifier.normalized.as_str(),
            identifier.display.as_str()
        ),
        ("isbn", "9781234", "978-1 234")
    );
}

#[test]
fn unsupported_types_warn_and_late_identifier_rejections_remain_deferred() {
    let mut raw = payload();
    raw["items"][0]["itemType"] = json!("future-type");
    raw["items"][0]["ISBN"] = json!(17);
    raw["items"][0]["ISSN"] = json!("123-4");
    let plan = capture(raw);
    let item = &plan.items[0];
    assert_eq!(item.receipt.item_type, "document");
    assert_eq!(item.receipt.warnings[0]["originalItemType"], "future-type");
    assert_eq!(item.identifiers[0], Err(CaptureRejectionV1::InvalidInput));
    assert_eq!(item.identifiers[1].as_ref().unwrap().normalized, "1234");
}

#[test]
fn original_metadata_limits_batch_identity_and_credential_rejection_are_preserved() {
    let raw = payload();
    let mut duplicate = raw.clone();
    duplicate["items"]
        .as_array_mut()
        .unwrap()
        .push(raw["items"][0].clone());
    assert!(matches!(
        prepare(input(duplicate)),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::InvalidInput
        }
    ));
    let mut credential = raw.clone();
    credential["items"][0]["extra"] = json!({"nested":{"request_headers":{"cookie":"synthetic"}}});
    assert!(matches!(
        prepare(input(credential)),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::InvalidInput
        }
    ));
    let mut large = raw.clone();
    large["items"][0]["extra"] = json!("x".repeat(MAX_METADATA_BYTES));
    assert!(matches!(
        prepare(input(large)),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::InvalidInput
        }
    ));
    assert!(identifier(&json!(true)).is_err());
    assert!(identifier(&json!("\n")).is_err());
    assert_eq!(identifier(&json!(-1)).unwrap(), "-1");
    assert!(validate_scope("Ω").is_err());
}

#[test]
fn pdf_preparation_keeps_original_hash_title_and_standalone_semantics() {
    let metadata = metadata();
    let BrowserCapturePreparationV1::Attachment { plan } =
        prepare(BrowserCaptureInputV1::Attachment {
            scope: "receiver".into(),
            session_id: "capture".into(),
            metadata: metadata.clone(),
            pdf: pdf(),
        })
    else {
        panic!("attachment");
    };
    assert_eq!(plan.display_name, "Full Text Ω");
    assert_eq!(plan.original_id, "pdf");
    assert_eq!(
        plan.request_sha256,
        digest(format!("{}:{}", metadata, "b".repeat(64)).as_bytes())
    );
    let BrowserCapturePreparationV1::Standalone { plan } =
        prepare(BrowserCaptureInputV1::Standalone {
            scope: "receiver".into(),
            session_id: "standalone".into(),
            metadata,
            pdf: pdf(),
        })
    else {
        panic!("standalone");
    };
    assert_eq!(plan.raw["metadataPending"], true);
    assert_eq!(plan.raw["itemType"], "document");
    assert_eq!(plan.attachment.external_id, "standalone");
    assert_eq!(
        decoded_title(&json!({"title":"=?utf-8?b?zqk=?="})).unwrap(),
        "Ω"
    );
    assert!(decoded_title(&json!({"title":"=?utf-8?q?=GG?="})).is_err());
    let mut too_large = pdf();
    too_large.byte_size = MAX_PDF_BYTES + 1;
    assert!(matches!(
        prepare(BrowserCaptureInputV1::Attachment {
            scope: "receiver".into(),
            session_id: "capture".into(),
            metadata: super::tests::metadata(),
            pdf: too_large
        }),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::InvalidInput
        }
    ));
}

#[test]
fn session_controls_keep_original_unsupported_priority_and_honest_capabilities() {
    assert!(matches!(
        prepare(BrowserCaptureInputV1::UpdateSession {
            scope: "".into(),
            payload: json!({"sessionID":"capture","target":"other"})
        }),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::Unsupported
        }
    ));
    assert!(matches!(
        prepare(BrowserCaptureInputV1::RecognizedItem {
            scope: "".into(),
            payload: json!({"sessionID":"capture"})
        }),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::InvalidInput
        }
    ));
    assert!(matches!(
        prepare(BrowserCaptureInputV1::RecognizedItem {
            scope: "receiver".into(),
            payload: json!({"sessionID":"capture"})
        }),
        BrowserCapturePreparationV1::Session {
            projection: SessionProjectionV1::Null,
            ..
        }
    ));
    assert!(matches!(
        prepare(BrowserCaptureInputV1::Snapshot {
            scope: "".into(),
            payload: json!({"pdf":true,"cookies":"synthetic"})
        }),
        BrowserCapturePreparationV1::Rejected {
            reason: CaptureRejectionV1::Unsupported
        }
    ));
    assert_eq!(library()["id"], "L1");
    assert!(
        matches!(prepare(BrowserCaptureInputV1::AttachmentResolvers {}),BrowserCapturePreparationV1::Value {value} if value==false)
    );
}

#[test]
fn exact_catalog_operation_roundtrip_retains_the_owned_capture_input_and_plan() {
    let input = input(payload());
    let request = CatalogInput::PrepareBrowserCapture {
        input: Box::new(input.clone()),
    };
    let output = crate::catalog::dispatch(request).unwrap();
    assert_eq!(output.operation(), CatalogOperation::PrepareBrowserCapture);
    assert_eq!(
        serde_json::from_str::<CatalogOutput>(&serde_json::to_string(&output).unwrap()).unwrap(),
        output
    );
    let CatalogOutput::BrowserCapture { input: echoed, .. } = output else {
        panic!("output");
    };
    assert_eq!(*echoed, input);
    assert_eq!(static_sql().len(), 12);
}
