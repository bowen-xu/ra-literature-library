use super::support::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    editable_template::{EditableTemplateDecisionV1 as Decision, EditableTemplateInputV1 as Input},
    literature_trace_protocol::{Request, RequestBody, ResponseBody, SnapshotRef},
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, os::unix::fs::PermissionsExt, path::Path};

fn call(directory: &Path, input: &Input) -> Request {
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(&CatalogInput::ValidateEditableTemplate {
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
        operation: CatalogOperation::ValidateEditableTemplate,
        snapshot: reference,
    };
    request
}

fn nested(depth: usize) -> String {
    format!(
        "{{\"PRIVATE_BODY_731\":{}0{}}}",
        "[".repeat(depth),
        "]".repeat(depth)
    )
}

#[test]
fn real_child_keeps_original_template_values_failures_and_named_result_binding() {
    let directory = tempfile::tempdir().unwrap();
    let accepted = " {\"kind\":\"reading_template_v1\",\"schemaVersion\":1,\"name\":\" 原模板 \",\"fields\":[{\"id\":\"question\",\"title\":\" 原标题 \",\"question\":\"PRIVATE_BODY_731 原问题? \",\"claimIds\":[],\"color\":\"#AbCdEf\"}]} \n";
    let mut cases = vec![
        (accepted.to_owned(), None),
        ("{\"kind\":\"wrong\"}".into(), Some("模板缺少fields数组")),
        (
            "{\"fields\":[null],\"kind\":\"wrong\"}".into(),
            Some("模板类型、名称或字段数量无效"),
        ),
        (
            accepted.replace("\"id\":\"question\"", "\"extra\":true"),
            Some("fields[0]包含未知属性"),
        ),
        (
            accepted.replace("\"id\":\"question\"", "\"id\":null"),
            Some("模板字段缺少稳定id"),
        ),
        (
            accepted.replace("\"id\":\"question\"", "\"id\":\"\""),
            Some("fields[0].id无效或重复"),
        ),
        (
            accepted.replace(" 原标题 ", ""),
            Some("fields[0].title无效"),
        ),
        (
            accepted.replace("PRIVATE_BODY_731 原问题? ", ""),
            Some("fields[0].question无效"),
        ),
        (
            accepted.replace("\"claimIds\":[]", "\"claimIds\":[\"paper_claim\"]"),
            Some("全局模板不能包含论文专用claimIds"),
        ),
        (accepted.replace("#AbCdEf", "bad"), Some("模板字段颜色无效")),
        (accepted.to_owned(), None),
    ];
    // The same ordinary Value parser is used by Core before entering the pure rule.
    let mut depth = 0;
    while serde_json::from_str::<Value>(&nested(depth + 1)).is_ok() {
        depth += 1;
    }
    assert!(depth > 100);
    cases.push((nested(depth), Some("模板缺少fields数组")));
    let inputs = cases
        .iter()
        .map(|(raw, _)| Input {
            candidate_json: raw.clone(),
        })
        .collect::<Vec<_>>();
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(inputs.iter().map(|input| call(directory.path(), input)));
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
    for ((reply, input), (_, expected)) in replies[1..replies.len() - 1]
        .iter()
        .zip(&inputs)
        .zip(&cases)
    {
        let ResponseBody::CatalogResult { payload } = &reply.body else {
            panic!("catalog result")
        };
        let bytes = fs::read(directory.path().join(&payload.relative_handle)).unwrap();
        assert_eq!(payload.byte_size, bytes.len() as u64);
        assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&bytes)));
        let CatalogOutput::EditableTemplate { outcome } = serde_json::from_slice(&bytes).unwrap()
        else {
            panic!("editable template result")
        };
        assert_eq!(outcome.input.as_ref(), input);
        match (&outcome.decision, expected) {
            (Decision::Validated { canonical_json }, None) => assert_eq!(
                *canonical_json,
                serde_json::from_str::<Value>(&input.candidate_json)
                    .unwrap()
                    .to_string()
            ),
            (Decision::Rejected { message }, Some(expected)) => {
                assert_eq!(message.as_str(), *expected)
            }
            _ => panic!("unexpected editable template outcome"),
        }
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
    let stdout = String::from_utf8(output.stdout).unwrap();
    for marker in [
        "candidateJson",
        "canonicalJson",
        "PRIVATE_BODY_731",
        "原模板",
    ] {
        assert!(!stdout.contains(marker));
    }
}

#[test]
fn real_child_rejects_malformed_inner_json_and_mismatched_operation_without_echo() {
    for (raw, mismatch, expected) in [
        (
            "{\"PRIVATE_BODY_731\":".to_owned(),
            false,
            "literature_host_snapshot_invalid",
        ),
        (nested(160), false, "literature_host_snapshot_invalid"),
        (
            "{\"PRIVATE_BODY_731\":true}".to_owned(),
            true,
            "literature_host_protocol_invalid",
        ),
    ] {
        let directory = tempfile::tempdir().unwrap();
        let mut call = call(
            directory.path(),
            &Input {
                candidate_json: raw,
            },
        );
        let RequestBody::Catalog {
            operation,
            snapshot,
        } = &mut call.body
        else {
            unreachable!()
        };
        if mismatch {
            *operation = CatalogOperation::ValidateStructured;
        }
        let name = snapshot.relative_handle.clone();
        let original = fs::read(directory.path().join(&name)).unwrap();
        let output = execute_requests(directory.path(), &session(call));
        assert!(!output.status.success());
        assert_eq!(
            output.stdout.iter().filter(|byte| **byte == b'\n').count(),
            1
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains(expected));
        assert!(!stderr.contains("PRIVATE_BODY_731"));
        assert!(!stderr.contains(directory.path().to_str().unwrap()));
        assert_eq!(fs::read(directory.path().join(name)).unwrap(), original);
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
