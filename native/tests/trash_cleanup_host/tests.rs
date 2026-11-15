use super::support::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    literature_trace_protocol::{Request, RequestBody, ResponseBody, SnapshotRef},
    trash_cleanup::TrashCleanupPreparationV1,
};
use sha2::{Digest, Sha256};
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

fn call(directory: &Path, bytes: &[u8]) -> Request {
    let mut request = request(RequestBody::Initialize);
    let reference = SnapshotRef::catalog_input(
        &request,
        bytes.len() as u64,
        format!("{:x}", Sha256::digest(bytes)),
    );
    let path = directory.join(&reference.relative_handle);
    fs::write(&path, bytes).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o400)).unwrap();
    request.body = RequestBody::Catalog {
        operation: CatalogOperation::PrepareTrashCleanup,
        snapshot: reference,
    };
    request
}

#[test]
fn real_child_prepares_static_cleanup_once_per_call_without_data_scope() {
    let directory = tempfile::tempdir().unwrap();
    let bytes = serde_json::to_vec(&CatalogInput::PrepareTrashCleanup {}).unwrap();
    let requests = vec![
        request(RequestBody::Initialize),
        call(directory.path(), &bytes),
        call(directory.path(), &bytes),
        request(RequestBody::Shutdown),
    ];
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    let mut plans = Vec::new();
    for (reply, original) in replies[1..3].iter().zip(&requests[1..3]) {
        let ResponseBody::CatalogResult { payload } = &reply.body else {
            panic!("expected catalog result")
        };
        let result = fs::read(directory.path().join(&payload.relative_handle)).unwrap();
        assert_eq!(payload.byte_size, result.len() as u64);
        assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&result)));
        let CatalogOutput::TrashCleanupPreparation {
            outcome: TrashCleanupPreparationV1::Ready { plan },
        } = serde_json::from_slice(&result).unwrap()
        else {
            panic!("expected cleanup ready")
        };
        assert_eq!(
            format!("{:x}", Sha256::digest(serde_json::to_vec(&plan).unwrap())),
            "fb0d5090e40cecd2d317d7a13a1e9216ddc27c4303089a38f49748576612bbf4"
        );
        plans.push(plan);
        let RequestBody::Catalog { snapshot, .. } = &original.body else {
            unreachable!()
        };
        assert_eq!(
            fs::read(directory.path().join(&snapshot.relative_handle)).unwrap(),
            bytes
        );
    }
    assert_eq!(plans[0], plans[1]);
    assert_eq!(requests[1].instance_id, requests[2].instance_id);
    assert_ne!(requests[1].request_id, requests[2].request_id);
}

#[test]
fn real_child_rejects_data_scope_and_operation_mismatch_without_echoing_content() {
    let directory = tempfile::tempdir().unwrap();
    for bytes in [
        br#"{"kind":"prepareTrashCleanup","itemId":"PRIVATE_SCOPE_129"}"#.as_slice(),
        br#"{"kind":"prepareTrashCleanup","sql":"PRIVATE_SQL_129"}"#,
        br#"{"kind":"projectMergeOperations","rows":{"rows":[]}}"#,
    ] {
        let output = execute_requests(directory.path(), &session(call(directory.path(), bytes)));
        assert!(!output.status.success());
        let diagnostic = String::from_utf8_lossy(&output.stderr);
        assert!(!diagnostic.contains("PRIVATE"));
        assert!(!diagnostic.contains(directory.path().to_str().unwrap()));
    }
}
