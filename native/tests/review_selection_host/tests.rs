use super::support::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    literature_trace_protocol::{Request, RequestBody, ResponseBody, SnapshotRef},
    review_selection::UnreviewedSelectionInputV1,
};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, os::unix::fs::PermissionsExt, path::Path};

fn call(directory: &Path, input: &UnreviewedSelectionInputV1) -> Request {
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(&CatalogInput::SelectUnreviewedFields {
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
        operation: CatalogOperation::SelectUnreviewedFields,
        snapshot: reference,
    };
    request
}

#[test]
fn real_child_selects_original_fields_and_returns_only_request_bound_files() {
    let directory = tempfile::tempdir().unwrap();
    let large = "PRIVATE_FIELD_731".to_owned() + &"原".repeat(4096);
    let inputs = [
        UnreviewedSelectionInputV1 {
            resource_id: " raw\0资源 ".into(),
            resource_revision: i64::MAX,
            pending_field_ids: vec![
                "乙".into(),
                "甲".into(),
                "乙".into(),
                "".into(),
                "\0".into(),
            ],
            protected_field_ids: vec!["甲".into(), "甲".into()],
            reviewed_field_ids: vec!["\0".into()],
        },
        UnreviewedSelectionInputV1 {
            resource_id: String::new(),
            resource_revision: i64::MIN,
            pending_field_ids: vec![],
            protected_field_ids: vec!["absent".into()],
            reviewed_field_ids: vec![],
        },
        UnreviewedSelectionInputV1 {
            resource_id: "large".into(),
            resource_revision: 0,
            pending_field_ids: vec![large.clone(), "reviewed".into(), large.clone()],
            protected_field_ids: vec![],
            reviewed_field_ids: vec!["reviewed".into()],
        },
    ];
    let expected = [
        vec!["乙".into(), "乙".into(), "".into()],
        vec![],
        vec![large.clone(), large],
    ];
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(inputs.iter().map(|input| call(directory.path(), input)));
    requests.push(request(RequestBody::Shutdown));
    let original_inputs = requests[1..requests.len() - 1]
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
    for ((reply, input), selected) in replies[1..replies.len() - 1]
        .iter()
        .zip(&inputs)
        .zip(expected)
    {
        let ResponseBody::CatalogResult { payload } = &reply.body else {
            panic!("catalog result")
        };
        let bytes = fs::read(directory.path().join(&payload.relative_handle)).unwrap();
        assert_eq!(payload.byte_size, bytes.len() as u64);
        assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&bytes)));
        let CatalogOutput::UnreviewedFields { selection } = serde_json::from_slice(&bytes).unwrap()
        else {
            panic!("selection")
        };
        assert_eq!(selection.input.as_ref(), input);
        assert_eq!(selection.selected_field_ids, selected);
        files.insert(payload.relative_handle.clone());
    }
    for (name, bytes) in original_inputs {
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
        "pendingFieldIds",
        "selectedFieldIds",
        "PRIVATE_FIELD_731",
        " raw",
    ] {
        assert!(!stdout.contains(marker));
    }
}

#[test]
fn real_child_rejects_an_operation_mismatch_without_executing_the_selection() {
    let directory = tempfile::tempdir().unwrap();
    let mut request = call(
        directory.path(),
        &UnreviewedSelectionInputV1 {
            resource_id: "PRIVATE_RESOURCE_731".into(),
            resource_revision: 1,
            pending_field_ids: vec!["PRIVATE_FIELD_731".into()],
            protected_field_ids: vec![],
            reviewed_field_ids: vec![],
        },
    );
    let RequestBody::Catalog { operation, .. } = &mut request.body else {
        unreachable!()
    };
    *operation = CatalogOperation::Select;
    let output = execute_requests(directory.path(), &session(request));
    assert!(!output.status.success());
    assert_eq!(
        output.stdout.iter().filter(|byte| **byte == b'\n').count(),
        1
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("literature_host_protocol_invalid"));
    assert!(!stderr.contains("PRIVATE_"));
    assert!(!stderr.contains(directory.path().to_str().unwrap()));
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}
