use super::support::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    context_metadata::{
        ContextMetadataDecisionV1 as Decision, ContextMetadataInputV1 as Input,
        ContextMetadataRejectionV1 as Rejection, ContextMetadataRequestV1 as WireInput,
    },
    literature_trace_protocol::{Request, RequestBody, ResponseBody, SnapshotRef},
    paper_context_wire::encode_payload,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, os::unix::fs::PermissionsExt, path::Path};

fn call(directory: &Path, input: &WireInput) -> Request {
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(&CatalogInput::ProjectContextMetadata {
        input: Box::new(input.clone()),
    })
    .unwrap();
    let reference = SnapshotRef::catalog_input(
        &request,
        bytes.len() as u64,
        format!("{:x}", Sha256::digest(&bytes)),
    );
    let path = directory.join(&reference.relative_handle);
    fs::write(&path, &bytes).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o400)).unwrap();
    request.body = RequestBody::Catalog {
        operation: CatalogOperation::ProjectContextMetadata,
        snapshot: reference,
    };
    request
}

fn original(input: &Input) -> String {
    let mut value = input.base.clone();
    let creators = input
        .creators
        .iter()
        .map(|pair| (&pair[0], &pair[1]))
        .collect::<Vec<_>>();
    let identifiers = input
        .identifiers
        .iter()
        .map(|pair| (&pair[0], &pair[1]))
        .collect::<Vec<_>>();
    value["creators"] = json!(creators);
    value["identifiers"] = json!(identifiers);
    value.to_string()
}

fn nested(depth: usize) -> Value {
    (0..depth).fold(Value::Null, |inner, _| json!([inner]))
}

#[test]
fn real_child_metadata_keeps_original_bytes_order_numbers_and_complete_binding() {
    let directory = tempfile::tempdir().unwrap();
    let mut inputs = [
        json!({"title":"题录 Ω","itemType":"article","abstract":null,"year":2026,
            "container":null,"volume":"","issue":null,"pages":null,"url":null,
            "language":"zh","bibtexKey":"key"}),
        json!({"title":"PRIVATE_BODY_901 \n\0原文🧪", "year":null,
            "creators":["old"], "identifiers":null,
            "numbers":[i64::MIN,i64::MAX,u64::MAX,-0.0,0.09090909090909091]}),
        json!({}),
        Value::Null,
        json!({"nested":nested(120)}),
    ]
    .into_iter()
    .map(|base| Input {
        paper_id: " unchanged paper ".into(),
        base,
        creators: vec![
            ["  机构".into(), "author".into()],
            ["B Given ".into(), "editor".into()],
        ],
        identifiers: vec![
            ["doi".into(), "first".into()],
            ["doi".into(), "first".into()],
            ["url".into(), "".into()],
        ],
    })
    .collect::<Vec<_>>();
    inputs.push(Input {
        paper_id: "paper".into(),
        base: json!({}),
        creators: vec![],
        identifiers: vec![],
    });
    let mut cases = inputs
        .iter()
        .map(|input| {
            (
                WireInput {
                    cbor_base64: encode_payload(input).unwrap(),
                },
                Decision::Projected {
                    body_json: original(input),
                },
            )
        })
        .collect::<Vec<_>>();
    for base in [json!("PRIVATE_BODY_901"), json!(7), json!([]), json!(false)] {
        let input = Input {
            paper_id: "paper".into(),
            base,
            creators: vec![],
            identifiers: vec![],
        };
        cases.push((
            WireInput {
                cbor_base64: encode_payload(&input).unwrap(),
            },
            Decision::Rejected {
                reason: Rejection::InvalidBase,
            },
        ));
    }
    // A normal reply after rejection uses the same initialized child.
    cases.push(cases[0].clone());
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
            panic!("catalog reply")
        };
        let bytes = fs::read(directory.path().join(&payload.relative_handle)).unwrap();
        assert_eq!(payload.byte_size, bytes.len() as u64);
        assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&bytes)));
        let CatalogOutput::ContextMetadata { outcome } = serde_json::from_slice(&bytes).unwrap()
        else {
            panic!("context metadata reply")
        };
        assert_eq!(outcome.input.as_ref(), input);
        assert_eq!(&outcome.decision, expected);
        files.insert(payload.relative_handle.clone());
    }
    for (name, bytes) in originals {
        assert_eq!(fs::read(directory.path().join(&name)).unwrap(), bytes);
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
    for marker in ["PRIVATE_BODY_901", "bodyJson", "cborBase64", "题录 Ω"] {
        assert!(!stdout.contains(marker));
    }
}

#[test]
fn real_child_metadata_rejects_invalid_inner_type_authority_and_depth_safely() {
    let inputs = [
        "PRIVATE_BODY_901%".into(),
        String::new(),
        encode_payload(&"PRIVATE_BODY_901").unwrap(),
        encode_payload(&json!({"paperId":"paper","base":{},"creators":[],"identifiers":[],"database":"PRIVATE_BODY_901"})).unwrap(),
        encode_payload(&Input { paper_id:"paper".into(), base:json!({"nested":nested(257)}), creators:vec![], identifiers:vec![] }).unwrap(),
    ];
    for cbor_base64 in inputs {
        let directory = tempfile::tempdir().unwrap();
        let call = call(directory.path(), &WireInput { cbor_base64 });
        let output = execute_requests(directory.path(), &session(call));
        assert!(!output.status.success());
        assert_eq!(
            output.stdout.iter().filter(|byte| **byte == b'\n').count(),
            1
        );
        let diagnostic = String::from_utf8_lossy(&output.stderr);
        assert!(diagnostic.contains("literature_host_snapshot_invalid"));
        assert!(!diagnostic.contains("PRIVATE_BODY_901"));
        assert!(!diagnostic.contains(directory.path().to_str().unwrap()));
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}

#[test]
fn real_child_metadata_requires_matching_catalog_operation() {
    let directory = tempfile::tempdir().unwrap();
    let input = WireInput {
        cbor_base64: encode_payload(&Input {
            paper_id: "paper".into(),
            base: json!({}),
            creators: vec![],
            identifiers: vec![],
        })
        .unwrap(),
    };
    let mut call = call(directory.path(), &input);
    let RequestBody::Catalog { operation, .. } = &mut call.body else {
        unreachable!()
    };
    *operation = CatalogOperation::PreparePaperContext;
    let output = execute_requests(directory.path(), &session(call));
    assert!(!output.status.success());
    assert_eq!(
        output.stdout.iter().filter(|byte| **byte == b'\n').count(),
        1
    );
    assert!(String::from_utf8_lossy(&output.stderr).contains("literature_host_protocol_invalid"));
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}
