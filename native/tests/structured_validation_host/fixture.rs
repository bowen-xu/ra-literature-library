use super::super::support::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    literature_trace_protocol::{Request, RequestBody, Response, ResponseBody, SnapshotRef},
    structured_validation::{StructuredValidationInputV1, StructuredValidationOutcomeV1},
};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, os::unix::fs::PermissionsExt, path::Path};

pub(super) fn call(directory: &Path, input: &StructuredValidationInputV1) -> Request {
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(&CatalogInput::ValidateStructured {
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
        operation: CatalogOperation::ValidateStructured,
        snapshot: reference,
    };
    request
}

pub(super) fn outcome(directory: &Path, response: &Response) -> StructuredValidationOutcomeV1 {
    let ResponseBody::CatalogResult { payload } = &response.body else {
        panic!("expected catalog result")
    };
    let bytes = fs::read(directory.join(&payload.relative_handle)).unwrap();
    assert_eq!(payload.byte_size, bytes.len() as u64);
    assert_eq!(payload.sha256, format!("{:x}", Sha256::digest(&bytes)));
    let CatalogOutput::StructuredValidation { outcome } = serde_json::from_slice(&bytes).unwrap()
    else {
        panic!("expected structured validation result")
    };
    *outcome
}

pub(super) fn run(
    directory: &Path,
    inputs: &[StructuredValidationInputV1],
) -> Vec<StructuredValidationOutcomeV1> {
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(inputs.iter().map(|input| call(directory, input)));
    requests.push(request(RequestBody::Shutdown));
    let original_inputs = requests[1..requests.len() - 1]
        .iter()
        .map(|request| {
            let RequestBody::Catalog { snapshot, .. } = &request.body else {
                unreachable!()
            };
            (
                snapshot.relative_handle.clone(),
                fs::read(directory.join(&snapshot.relative_handle)).unwrap(),
            )
        })
        .collect::<Vec<_>>();
    let output = execute_requests(directory, &requests);
    let replies = responses(&output, &requests);
    let outcomes = replies[1..replies.len() - 1]
        .iter()
        .map(|response| outcome(directory, response))
        .collect();
    let mut expected_files = BTreeSet::new();
    for (name, original) in original_inputs {
        assert_eq!(fs::read(directory.join(&name)).unwrap(), original);
        expected_files.insert(name);
    }
    for reply in &replies[1..replies.len() - 1] {
        let ResponseBody::CatalogResult { payload } = &reply.body else {
            unreachable!()
        };
        expected_files.insert(payload.relative_handle.clone());
        assert!(payload.relative_handle.starts_with("catalog-result-"));
    }
    let actual_files = fs::read_dir(directory)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect::<BTreeSet<_>>();
    assert_eq!(actual_files, expected_files);
    let stdout = String::from_utf8(output.stdout).unwrap();
    for marker in [
        "candidateJson",
        "canonicalJson",
        "quoteExact",
        "PRIVATE_BODY_731",
    ] {
        assert!(
            !stdout.contains(marker),
            "payload must remain in named result files"
        );
    }
    outcomes
}
