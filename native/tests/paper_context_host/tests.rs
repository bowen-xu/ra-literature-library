use super::support::*;
use research_literature_library_native::{paper_context, paper_context_snapshot};
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    literature_trace_protocol::{Request, RequestBody, ResponseBody, SnapshotRef},
    paper_context::*,
    paper_context_wire::{
        PaperContextDecisionV1 as Decision, PaperContextInputV1 as Input, decode_payload,
        encode_payload,
    },
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, os::unix::fs::PermissionsExt, path::Path};

fn call(directory: &Path, input: &Input) -> Request {
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(&CatalogInput::PreparePaperContext {
        input: Box::new(input.clone()),
    })
    .unwrap();
    let reference = SnapshotRef::catalog_input(
        &request,
        bytes.len() as u64,
        format!("{:x}", Sha256::digest(&bytes)),
    );
    let path = directory.join(&reference.relative_handle);
    fs::write(&path, bytes).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o400)).unwrap();
    request.body = RequestBody::Catalog {
        operation: CatalogOperation::PreparePaperContext,
        snapshot: reference,
    };
    request
}

#[test]
fn real_child_paper_context_build_project_digest_and_rejection_preserve_named_binding() {
    let directory = tempfile::tempdir().unwrap();
    let build: PaperContextBuildInputV1 = serde_json::from_value(json!({
        "paperId": "paper", "attachments": [{"id": "attachment", "displayName": "论文.pdf",
            "contentSha256": "sha", "hasStaleParse": false, "parse": {"id": "run", "jsonContent": {
                "pages": {"1": {"size": {"width": 300, "height": 600}}},
                "texts": [{"text": " PRIVATE_BODY_497 证据\nα ", "prov": [{"page_no": 1,
                    "charspan": [0, 9], "bbox": {"l": 10, "t": 20, "r": 50, "b": 60}}]}],
                "tables": [{"data": {"z": "汉", "a": [null, 1]}, "prov": [{"page_no": 1,
                    "bbox": {"l": 10, "t": 80, "r": 280, "b": 160}}]}],
                "pictures": [{"prov": [{"page_no": 1,
                    "bbox": {"l": 40, "t": 300, "r": 200, "b": 500, "coord_origin": "BOTTOMLEFT"}}]}]
            }}}]
    })).unwrap();
    let prepared = paper_context::build(&build);
    let project = SnapshotProjectionInputV1 {
        paper_id: build.paper_id.clone(),
        attachment_statuses: prepared.attachment_statuses.clone(),
        context_items: prepared.context_items.clone(),
        image_hashes: [("P1-F1".into(), "image".into())].into(),
    };
    let projection = paper_context_snapshot::project(&project).unwrap();
    let digest = SnapshotDigestInputV1 {
        context_schema_version: projection.context_schema_version,
        paper_id: build.paper_id.clone(),
        attachments: projection.attachments.clone(),
        items: projection.items.clone(),
    };
    let mut unavailable = project.clone();
    unavailable.attachment_statuses[0].parse_run_id = None;
    let cases = vec![
        (
            Input::Build {
                cbor_base64: encode_payload(&build).unwrap(),
            },
            Decision::Built {
                prepared_cbor_base64: encode_payload(&prepared).unwrap(),
            },
        ),
        (
            Input::Project {
                cbor_base64: encode_payload(&project).unwrap(),
            },
            Decision::Projected {
                projection_cbor_base64: encode_payload(&projection).unwrap(),
            },
        ),
        (
            Input::Digest {
                cbor_base64: encode_payload(&digest).unwrap(),
            },
            Decision::Digested {
                context_hash: projection.context_hash,
            },
        ),
        (
            Input::Project {
                cbor_base64: encode_payload(&unavailable).unwrap(),
            },
            Decision::Rejected {
                message: "只有完成 Docling 解析的附件才能冻结论文上下文".into(),
            },
        ),
    ];
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(cases.iter().map(|(input, _)| call(directory.path(), input)));
    requests.push(request(RequestBody::Shutdown));
    let originals = requests[1..requests.len() - 1]
        .iter()
        .map(|request| {
            let RequestBody::Catalog { snapshot, .. } = &request.body else {
                unreachable!()
            };
            (
                snapshot.relative_handle.clone(),
                fs::read(directory.path().join(&snapshot.relative_handle)).unwrap(),
            )
        })
        .collect::<Vec<_>>();
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    let mut files = BTreeSet::new();
    for (reply, (input, expected)) in replies[1..replies.len() - 1].iter().zip(&cases) {
        let ResponseBody::CatalogResult { payload } = &reply.body else {
            panic!("catalog result")
        };
        let bytes = fs::read(directory.path().join(&payload.relative_handle)).unwrap();
        assert_eq!(payload.byte_size, bytes.len() as u64);
        assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&bytes)));
        let CatalogOutput::PaperContext { outcome } = serde_json::from_slice(&bytes).unwrap()
        else {
            panic!("paper context output")
        };
        assert_eq!(outcome.input.as_ref(), input);
        assert_eq!(&outcome.decision, expected);
        files.insert(payload.relative_handle.clone());
    }
    for (name, original) in originals {
        assert_eq!(fs::read(directory.path().join(&name)).unwrap(), original);
        files.insert(name);
    }
    assert_eq!(
        fs::read_dir(directory.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect::<BTreeSet<_>>(),
        files
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    for marker in [
        "cborBase64",
        "preparedCborBase64",
        "projectionCborBase64",
        "PRIVATE_BODY_497",
        "证据",
    ] {
        assert!(!stdout.contains(marker));
    }
}

#[test]
fn real_child_paper_context_rejects_malformed_inner_codec_or_wrong_operation_without_echo() {
    for operation in ["build", "project", "digest", "mismatched"] {
        let directory = tempfile::tempdir().unwrap();
        let raw = "{\"PRIVATE_BODY_497\":".to_owned();
        let input = match operation {
            "build" => Input::Build { cbor_base64: raw },
            "project" => Input::Project { cbor_base64: raw },
            _ => Input::Digest { cbor_base64: raw },
        };
        let mut call = call(directory.path(), &input);
        let RequestBody::Catalog {
            operation: wire_operation,
            snapshot,
        } = &mut call.body
        else {
            unreachable!()
        };
        if operation == "mismatched" {
            *wire_operation = CatalogOperation::ValidateEditableTemplate;
        }
        let name = snapshot.relative_handle.clone();
        let original = fs::read(directory.path().join(&name)).unwrap();
        let output = execute_requests(directory.path(), &session(call));
        assert!(!output.status.success());
        assert_eq!(output.stdout.iter().filter(|b| **b == b'\n').count(), 1);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains(if operation == "mismatched" {
            "literature_host_protocol_invalid"
        } else {
            "literature_host_snapshot_invalid"
        }));
        assert!(!stderr.contains("PRIVATE_BODY_497"));
        assert!(!stderr.contains(directory.path().to_str().unwrap()));
        assert_eq!(fs::read(directory.path().join(name)).unwrap(), original);
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}

fn roundtrip(input: &Input) -> Decision {
    let directory = tempfile::tempdir().unwrap();
    let call = call(directory.path(), input);
    let RequestBody::Catalog { snapshot, .. } = &call.body else {
        unreachable!()
    };
    let name = snapshot.relative_handle.clone();
    let original = fs::read(directory.path().join(&name)).unwrap();
    let requests = session(call);
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    let ResponseBody::CatalogResult { payload } = &replies[1].body else {
        panic!("catalog reply")
    };
    let bytes = fs::read(directory.path().join(&payload.relative_handle)).unwrap();
    assert_eq!(payload.byte_size, bytes.len() as u64);
    assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&bytes)));
    let CatalogOutput::PaperContext { outcome } = serde_json::from_slice(&bytes).unwrap() else {
        panic!("context reply")
    };
    assert_eq!(outcome.input.as_ref(), input);
    assert_eq!(fs::read(directory.path().join(name)).unwrap(), original);
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
    assert!(!String::from_utf8_lossy(&output.stdout).contains("PRIVATE_BODY_497"));
    outcome.decision
}

#[test]
fn real_child_paper_context_keeps_threshold_bits_canonical_hash_id_and_present_null() {
    // This positive coordinate changed by one ULP under the abandoned JSON
    // payload, crossing the original twelve-decimal hash boundary.
    let document = json!({
        "pages":{"1":{"size":{"width":612,"height":792}},"2":{"size":{"width":11,"height":13}}},
        "texts":[{"text":"PRIVATE_BODY_497 汉字 α\nβ", "prov":[
            {"page_no":1,"bbox":{"l":1.23318e-7,"t":10,"r":500,"b":50},"charspan":[0,9]},
            {"page_no":2,"bbox":{"l":1,"t":3,"r":6,"b":7,"coord_origin":"BOTTOMLEFT"}}
        ]}],
        "tables":[
            {"data":null,"prov":[{"page_no":1,"bbox":{"l":13,"t":60,"r":501,"b":151}}]},
            {"data":{"unicode":"证据🧪", "numbers":[i64::MIN,i64::MAX,u64::MAX,-0.0,0.09090909090909091]},
                "prov":[{"page_no":2,"bbox":{"l":2,"t":3,"r":9,"b":11}}]}
        ]
    });
    // Core's existing Docling JSON decode precedes the new typed transport.
    let document = serde_json::from_str(&document.to_string()).unwrap();
    let build = PaperContextBuildInputV1 {
        paper_id: "paper".into(),
        attachments: vec![ContextAttachmentV1 {
            id: "a".into(),
            display_name: "论文.pdf".into(),
            content_sha256: "sha".into(),
            parse: Some(ContextParseRunV1 {
                id: "run".into(),
                json_content: document,
            }),
            has_stale_parse: false,
        }],
    };
    let expected = paper_context::build(&build);
    assert_eq!(
        expected.context_items[0].regions[0].rect.x.to_bits(),
        0x3debb1a6a65b4778
    );
    let Decision::Built {
        prepared_cbor_base64,
    } = roundtrip(&Input::Build {
        cbor_base64: encode_payload(&build).unwrap(),
    })
    else {
        panic!("built")
    };
    let prepared: PreparedPaperContextV1 = decode_payload(&prepared_cbor_base64).unwrap();
    assert_eq!(prepared, expected);
    for (left, right) in prepared.context_items[0]
        .regions
        .iter()
        .zip(&expected.context_items[0].regions)
    {
        assert_eq!(
            [left.rect.x, left.rect.y, left.rect.width, left.rect.height].map(f64::to_bits),
            [
                right.rect.x,
                right.rect.y,
                right.rect.width,
                right.rect.height
            ]
            .map(f64::to_bits)
        );
    }
    assert_eq!(
        prepared.context_items[1].table_json,
        Some(serde_json::Value::Null)
    );
    assert_eq!(prepared.context_items[0].table_json, None);
    let project = SnapshotProjectionInputV1 {
        paper_id: "paper".into(),
        attachment_statuses: prepared.attachment_statuses,
        context_items: prepared.context_items,
        image_hashes: Default::default(),
    };
    let expected_projection = paper_context_snapshot::project(&project).unwrap();
    let Decision::Projected {
        projection_cbor_base64,
    } = roundtrip(&Input::Project {
        cbor_base64: encode_payload(&project).unwrap(),
    })
    else {
        panic!("projected")
    };
    let projection: SnapshotProjectionV1 = decode_payload(&projection_cbor_base64).unwrap();
    assert_eq!(projection, expected_projection);
    assert_eq!(
        projection.items[0].regions[0].rect.x.to_bits(),
        0x3debb1a6a65b4778
    );
    assert_eq!(
        projection.items[1]
            .table_json
            .as_ref()
            .map(serde_json::Value::to_string),
        Some("null".into())
    );
    assert_eq!(projection.items[0].table_json, None);
    let digest_input = |p: &SnapshotProjectionV1| SnapshotDigestInputV1 {
        context_schema_version: p.context_schema_version,
        paper_id: "paper".into(),
        attachments: p.attachments.clone(),
        items: p.items.clone(),
    };
    assert_eq!(
        paper_context_snapshot::canonical_json(&digest_input(&projection)).unwrap(),
        paper_context_snapshot::canonical_json(&digest_input(&expected_projection)).unwrap()
    );
    assert_eq!(
        roundtrip(&Input::Digest {
            cbor_base64: encode_payload(&digest_input(&projection)).unwrap()
        }),
        Decision::Digested {
            context_hash: expected_projection.context_hash
        }
    );
}
