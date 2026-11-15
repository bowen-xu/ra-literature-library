use super::*;
use crate::catalog::{CatalogInput, CatalogOutput, dispatch};
use research_workbench_native_sdk::paper_context::{PreparedPaperContextV1, SnapshotProjectionV1};
use serde_json::json;
mod preparation;
mod preview;

fn invoke(input: Input) -> PaperContextOutcomeV1 {
    let CatalogOutput::PaperContext { outcome } = dispatch(CatalogInput::PreparePaperContext {
        input: Box::new(input.clone()),
    })
    .unwrap() else {
        panic!("paper context output")
    };
    assert_eq!(outcome.input.as_ref(), &input);
    *outcome
}

#[test]
fn catalog_build_project_and_digest_echo_exact_input_and_use_the_unique_rules() {
    let original: PaperContextBuildInputV1 = serde_json::from_value(json!({
        "paperId": "paper", "attachments": [{"id": "attachment", "displayName": "论文.pdf",
        "contentSha256": "sha", "hasStaleParse": false, "parse": {"id": "run", "jsonContent": {
            "pages": {"1": {"size": {"width": 612, "height": 792}}},
            "texts": [{"text": "证据 α", "prov": [{"page_no": 1,
                "bbox": {"l": 1.23318e-7, "t": 20, "r": 500, "b": 60}}]}],
            "tables": [{"data": null, "prov": [{"page_no": 1,
                "bbox": {"l": 13, "t": 81, "r": 507, "b": 149}}]}]
        }}}]
    }))
    .unwrap();
    let Decision::Built {
        prepared_cbor_base64,
    } = invoke(Input::Build {
        cbor_base64: encode_payload(&original).unwrap(),
    })
    .decision
    else {
        panic!("built")
    };
    let prepared: PreparedPaperContextV1 = decode_payload(&prepared_cbor_base64).unwrap();
    assert_eq!(prepared, crate::paper_context::build(&original));
    assert_eq!(
        prepared.context_items[1].table_json,
        Some(serde_json::Value::Null)
    );
    let project = SnapshotProjectionInputV1 {
        paper_id: "paper".into(),
        attachment_statuses: prepared.attachment_statuses,
        context_items: prepared.context_items,
        image_hashes: Default::default(),
    };
    let Decision::Projected {
        projection_cbor_base64,
    } = invoke(Input::Project {
        cbor_base64: encode_payload(&project).unwrap(),
    })
    .decision
    else {
        panic!("projected")
    };
    let projected: SnapshotProjectionV1 = decode_payload(&projection_cbor_base64).unwrap();
    assert_eq!(
        projected,
        crate::paper_context_snapshot::project(&project).unwrap()
    );
    assert_eq!(projected.items[1].table_json, Some(serde_json::Value::Null));
    let digest = SnapshotDigestInputV1 {
        context_schema_version: projected.context_schema_version,
        paper_id: "paper".into(),
        attachments: projected.attachments,
        items: projected.items,
    };
    assert_eq!(
        invoke(Input::Digest {
            cbor_base64: encode_payload(&digest).unwrap()
        })
        .decision,
        Decision::Digested {
            context_hash: projected.context_hash
        }
    );
}

#[test]
fn catalog_keeps_domain_rejection_separate_from_temporary_and_inner_codec_failure() {
    let input: SnapshotProjectionInputV1 =
        serde_json::from_value(json!({"paperId": "paper", "attachmentStatuses": [{
        "attachmentId": "a", "displayName": "PDF", "contentSha256": "sha", "parseStatus": "stale"
    }], "contextItems": [], "imageHashes": {}}))
        .unwrap();
    assert_eq!(
        invoke(Input::Project {
            cbor_base64: encode_payload(&input).unwrap()
        })
        .decision,
        Decision::Rejected {
            message: "只有完成 Docling 解析的附件才能冻结论文上下文".into()
        }
    );
    assert_eq!(
        failure(crate::paper_context_snapshot::PaperContextProjectionError::TemporaryUnavailable),
        Decision::Unavailable {}
    );
    for raw in [
        "PRIVATE_BODY_497%".to_owned(),
        String::new(),
        encode_payload(&"PRIVATE_BODY_497").unwrap(),
    ] {
        for input in [
            Input::Build {
                cbor_base64: raw.clone(),
            },
            Input::Project {
                cbor_base64: raw.clone(),
            },
            Input::Digest {
                cbor_base64: raw.clone(),
            },
            Input::Preview {
                cbor_base64: raw.clone(),
            },
            Input::Prepare {
                cbor_base64: raw.clone(),
            },
        ] {
            let error = dispatch(CatalogInput::PreparePaperContext {
                input: Box::new(input),
            })
            .unwrap_err();
            assert_eq!(error, CatalogDecodeError::InvalidPaperContextInput);
            assert!(!error.to_string().contains("PRIVATE_BODY_497"));
        }
    }
}
