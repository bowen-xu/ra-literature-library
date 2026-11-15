use super::*;
use research_workbench_native_sdk::{
    paper_context::{PaperContextAttachment, PaperContextItem},
    paper_context_preview::{
        PaperContextError as Error, PaperContextPreviewDecisionV1 as Result,
        PaperContextPreviewInputV1 as Stage, PaperContextRequest,
    },
};
fn evaluate(input: Stage) -> Result {
    let Decision::Previewed {
        decision_cbor_base64,
    } = invoke(Input::Preview {
        cbor_base64: encode_payload(&input).unwrap(),
    })
    .decision
    else {
        panic!("preview decision")
    };
    let result: Result = decode_payload(&decision_cbor_base64).unwrap();
    assert_eq!(result, crate::paper_context_preview::evaluate(input));
    result
}
#[test]
fn preview_stages_preserve_original_rejection_order_and_snapshot_identity() {
    let mut item: PaperContextItem = serde_json::from_value(json!({
        "id":"P1-T1", "attachmentId":"attachment", "contentSha256":"a".repeat(64),
        "parseRunId":"parse", "rawRef":"#/tables/0", "kind":"table", "label":null,
        "pageIndex":0,"regions":[{"pageIndex":0,"rect":{"x":0.1,"y":0.2,"width":0.5,"height":0.1}}],
        "charspan":null,"sourceTextHash":null,"text":null,"tableJson":null,"imageContentSha256":null
    }))
    .unwrap();
    item.table_json = Some(serde_json::Value::Null);
    let snapshot = SnapshotDigestInputV1 {
        context_schema_version: 1,
        paper_id: "paper".into(),
        attachments: vec![PaperContextAttachment {
            attachment_id: "attachment".into(),
            content_sha256: "a".repeat(64),
            parse_run_id: "parse".into(),
            ordinal: 0,
        }],
        items: vec![item],
    };
    let hash = crate::paper_context_snapshot::digest(&snapshot).unwrap();
    let request = PaperContextRequest {
        paper_id: "paper".into(),
        snapshot_id: format!("paper-context-{hash}"),
        expected_context_hash: hash.clone(),
    };
    assert_eq!(
        evaluate(Stage::Header {
            request: request.clone(),
            header: None
        }),
        Result::Rejected {
            error: Error::Unavailable
        }
    );
    let mut invalid = request.clone();
    invalid.paper_id.clear();
    assert_eq!(
        evaluate(Stage::Header {
            request: invalid,
            header: None
        }),
        Result::Rejected {
            error: Error::InvalidInput
        }
    );
    assert_eq!(
        evaluate(Stage::Header {
            request: request.clone(),
            header: Some(("other".into(), hash.clone(), 2))
        }),
        Result::Rejected {
            error: Error::Conflict
        }
    );
    assert_eq!(
        evaluate(Stage::Header {
            request: request.clone(),
            header: Some(("paper".into(), hash.clone(), 2))
        }),
        Result::Rejected {
            error: Error::Corrupt
        }
    );
    assert_eq!(
        evaluate(Stage::Header {
            request: request.clone(),
            header: Some(("paper".into(), hash, 1))
        }),
        Result::Validated {}
    );
    assert_eq!(
        evaluate(Stage::Preflight {
            item_count: 20_001,
            item_bytes: 0,
            invalid_page_count: 1,
            attachment_count: 0,
            attachment_bytes: 0
        }),
        Result::Rejected {
            error: Error::Budget
        }
    );
    assert_eq!(
        evaluate(Stage::Preflight {
            item_count: 0,
            item_bytes: 0,
            invalid_page_count: 0,
            attachment_count: 0,
            attachment_bytes: 0
        }),
        Result::Rejected {
            error: Error::Corrupt
        }
    );
    assert_eq!(
        evaluate(Stage::Preflight {
            item_count: 0,
            item_bytes: 0,
            invalid_page_count: 0,
            attachment_count: 1,
            attachment_bytes: 0
        }),
        Result::Validated {}
    );
    let Result::Previewed { preview } = evaluate(Stage::Snapshot {
        request: request.clone(),
        snapshot: snapshot.clone(),
    }) else {
        panic!("preview")
    };
    assert_eq!(preview.snapshot_id, request.snapshot_id);
    assert_eq!(preview.context_hash, request.expected_context_hash);
    assert_eq!(preview.attachments, snapshot.attachments);
    assert_eq!(
        preview.items[0].item.table_json,
        Some(serde_json::Value::Null)
    );
    let mut corrupt = snapshot;
    corrupt.attachments[0].parse_run_id = "changed".into();
    assert_eq!(
        evaluate(Stage::Snapshot {
            request,
            snapshot: corrupt
        }),
        Result::Rejected {
            error: Error::Corrupt
        }
    );
}
