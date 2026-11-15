use super::support::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    data::{DataRows, DataValue},
    duplicate_review::{
        DuplicateDecisionCompletionV1, DuplicateDecisionPreparationV1, DuplicateDecisionRequestV1,
        DuplicateRejectionCodeV1, FinishDuplicateDecisionInputV1,
    },
    literature_trace_protocol::{Request, RequestBody, Response, ResponseBody, SnapshotRef},
};
use sha2::{Digest, Sha256};
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

fn call(directory: &Path, input: &CatalogInput) -> Request {
    let mut request = request(RequestBody::Initialize);
    let bytes = serde_json::to_vec(input).unwrap();
    let reference = SnapshotRef::catalog_input(
        &request,
        bytes.len() as u64,
        format!("{:x}", Sha256::digest(&bytes)),
    );
    let path = directory.join(&reference.relative_handle);
    fs::write(&path, bytes).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o400)).unwrap();
    request.body = RequestBody::Catalog {
        operation: input.operation(),
        snapshot: reference,
    };
    request
}

fn result(directory: &Path, response: &Response) -> CatalogOutput {
    let ResponseBody::CatalogResult { payload } = &response.body else {
        panic!("expected catalog result")
    };
    let bytes = fs::read(directory.join(&payload.relative_handle)).unwrap();
    assert_eq!(bytes.len() as u64, payload.byte_size);
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), payload.sha256);
    serde_json::from_slice(&bytes).unwrap()
}

fn strings(values: &[&str]) -> DataRows {
    DataRows {
        rows: vec![
            values
                .iter()
                .map(|value| DataValue::Text((*value).into()))
                .collect(),
        ],
    }
}

#[test]
fn real_host_runs_four_duplicate_ops_and_domain_rejections_keep_the_same_instance_healthy() {
    let directory = tempfile::tempdir().unwrap();
    let request_value = DuplicateDecisionRequestV1 {
        candidate_id: " raw id ".into(),
        decision: "dismiss".into(),
    };
    let inputs = [
        CatalogInput::ProjectDuplicateCandidates {
            rows: strings(&[
                "id",
                "a",
                " 原左侧 ",
                "b",
                "Right",
                "doi",
                "3fe70a3d70a3d70a",
            ]),
        },
        CatalogInput::ProjectMergeOperations {
            rows: strings(&["op", "a", "Left", "b", " Right ", "applied", " raw time "]),
        },
        CatalogInput::PrepareDuplicateDecision {
            request: DuplicateDecisionRequestV1 {
                candidate_id: "raw".into(),
                decision: " dismiss ".into(),
            },
        },
        CatalogInput::PrepareDuplicateDecision {
            request: request_value.clone(),
        },
        CatalogInput::FinishDuplicateDecision {
            input: FinishDuplicateDecisionInputV1 {
                request: request_value.clone(),
                affected_rows: 0,
            },
        },
        CatalogInput::FinishDuplicateDecision {
            input: FinishDuplicateDecisionInputV1 {
                request: request_value.clone(),
                affected_rows: 2,
            },
        },
    ];
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(inputs.iter().map(|input| call(directory.path(), input)));
    requests.push(request(RequestBody::Shutdown));
    let original_inputs = requests[1..7]
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
    let results = replies[1..7]
        .iter()
        .map(|reply| result(directory.path(), reply))
        .collect::<Vec<_>>();
    for (actual, input) in results.iter().zip(&inputs) {
        assert_eq!(actual.operation(), input.operation());
    }
    let CatalogOutput::DuplicateCandidates { items } = &results[0] else {
        panic!("candidates")
    };
    assert_eq!(items[0].left_title, " 原左侧 ");
    assert_eq!(
        items[0].confidence_bits.to_f64().to_bits(),
        0.72_f64.to_bits()
    );
    assert!(
        matches!(&results[2], CatalogOutput::DuplicateDecisionPreparation {
        outcome:DuplicateDecisionPreparationV1::Rejected {error}
    } if error.code==DuplicateRejectionCodeV1::InvalidInput)
    );
    assert!(
        matches!(&results[3], CatalogOutput::DuplicateDecisionPreparation {
        outcome:DuplicateDecisionPreparationV1::Ready {request}
    } if request==&request_value)
    );
    assert!(
        matches!(&results[4], CatalogOutput::DuplicateDecisionCompletion {
        outcome:DuplicateDecisionCompletionV1::Rejected {error}
    } if error.code==DuplicateRejectionCodeV1::NotFound)
    );
    assert!(matches!(
        &results[5],
        CatalogOutput::DuplicateDecisionCompletion {
            outcome: DuplicateDecisionCompletionV1::Applied {}
        }
    ));
    for (handle, bytes) in original_inputs {
        assert_eq!(fs::read(directory.path().join(handle)).unwrap(), bytes);
    }
}

#[test]
fn real_host_rejects_malformed_bits_without_echoing_private_row_content() {
    let directory = tempfile::tempdir().unwrap();
    let input = CatalogInput::ProjectDuplicateCandidates {
        rows: strings(&[
            "PRIVATE_ID_823",
            "a",
            "A",
            "b",
            "B",
            "doi",
            "PRIVATE_BITS_823",
        ]),
    };
    let requests = session(call(directory.path(), &input));
    let output = execute_requests(directory.path(), &requests);
    assert!(!output.status.success());
    let diagnostic = String::from_utf8_lossy(&output.stderr);
    assert!(diagnostic.contains("snapshot_invalid"));
    assert!(!diagnostic.contains("PRIVATE"));
    assert!(!diagnostic.contains(directory.path().to_str().unwrap()));
}

#[test]
fn real_host_rejects_duplicate_operation_and_input_stage_mismatch() {
    let directory = tempfile::tempdir().unwrap();
    let mut request = call(
        directory.path(),
        &CatalogInput::ProjectMergeOperations {
            rows: DataRows { rows: vec![] },
        },
    );
    let RequestBody::Catalog { operation, .. } = &mut request.body else {
        unreachable!()
    };
    *operation = CatalogOperation::ProjectDuplicateCandidates;
    let output = execute_requests(directory.path(), &session(request));
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("protocol_invalid"));
}

#[test]
fn real_host_prepares_undo_from_raw_snapshot_with_the_same_request_bound_exchange() {
    use research_workbench_native_sdk::duplicate_undo::UndoMergePrepareInputV1;
    let directory = tempfile::tempdir().unwrap();
    let raw = concat!(
        " {\"candidateId\":\"raw\",\"attachmentIds\":[],\"identifierIds\":[],\"anchorIds\":[],",
        "\"addedProjectIds\":[],\"addedTagIds\":[],\"addedProvenanceFields\":[],",
        "\"createdReadingState\":false,\"mergedArchivedAt\":null} \n"
    );
    let input = CatalogInput::PrepareDuplicateUndo {
        input: UndoMergePrepareInputV1 {
            snapshot_json: raw.into(),
        },
    };
    let request = call(directory.path(), &input);
    let RequestBody::Catalog { snapshot, .. } = &request.body else {
        unreachable!()
    };
    let original = fs::read(directory.path().join(&snapshot.relative_handle)).unwrap();
    let requests = session(request.clone());
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    let prepared = result(directory.path(), &replies[1]);
    assert_eq!(prepared.operation(), CatalogOperation::PrepareDuplicateUndo);
    let CatalogOutput::DuplicateUndoPreparation { outcome } = prepared else {
        panic!("undo preparation")
    };
    assert!(outcome.classification.is_none());
    assert_eq!(
        outcome.snapshot_sha256,
        format!("{:x}", Sha256::digest(raw.as_bytes()))
    );
    assert_eq!(
        fs::read(directory.path().join(&snapshot.relative_handle)).unwrap(),
        original
    );
}

#[test]
fn real_host_prepares_merge_endpoints_and_keeps_rejections_in_the_same_session() {
    use research_workbench_native_sdk::duplicate_merge_prepare::{
        MergePreparationV1, MergePrepareInputV1, MergeRejectionV1,
    };
    let directory = tempfile::tempdir().unwrap();
    let inputs = [" left ", "right", "left", "same"].map(|survivor| MergePrepareInputV1 {
        candidate_id: " raw\0candidate ".into(),
        survivor_item_id: survivor.into(),
        left_item_id: if survivor == "same" {
            "same".into()
        } else {
            " left ".into()
        },
        right_item_id: if survivor == "same" {
            "same".into()
        } else {
            "right".into()
        },
    });
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(inputs.iter().map(|input| {
        call(
            directory.path(),
            &CatalogInput::PrepareDuplicateMerge {
                input: Box::new(input.clone()),
            },
        )
    }));
    requests.push(request(RequestBody::Shutdown));
    let originals = requests[1..5]
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
    for (index, expected) in [Some("right"), Some(" left "), None, Some("same")]
        .into_iter()
        .enumerate()
    {
        let actual = result(directory.path(), &replies[index + 1]);
        assert_eq!(actual.operation(), CatalogOperation::PrepareDuplicateMerge);
        let outcome = match expected {
            Some(merged) => MergePreparationV1::Ready {
                input: inputs[index].clone(),
                merged_item_id: merged.into(),
                operation_state: "applied".into(),
                created_reading_state: false,
            },
            None => MergePreparationV1::Rejected {
                reason: MergeRejectionV1::NotFound,
            },
        };
        assert_eq!(
            actual,
            CatalogOutput::DuplicateMergePreparation {
                outcome: Box::new(outcome),
            }
        );
    }
    for (handle, bytes) in originals {
        assert_eq!(fs::read(directory.path().join(handle)).unwrap(), bytes);
    }
}

#[test]
fn real_host_prepares_all_six_lifecycle_inputs_and_keeps_empty_batch_rejection_healthy() {
    use research_workbench_native_sdk::literature_lifecycle::{
        LifecyclePreparationV1, LifecycleRejectionCodeV1, LifecycleRejectionV1, LifecycleRequestV1,
    };
    let directory = tempfile::tempdir().unwrap();
    let inputs = [
        LifecycleRequestV1::TrashMany { item_ids: vec![] },
        LifecycleRequestV1::Archive { item_id: "".into() },
        LifecycleRequestV1::Restore {
            item_id: " raw ".into(),
        },
        LifecycleRequestV1::Trash {
            item_id: "id\0raw".into(),
        },
        LifecycleRequestV1::RestoreTrash {
            item_id: "原文献".into(),
        },
        LifecycleRequestV1::SetProjects {
            item_id: " raw ".into(),
            project_ids: vec!["b".into(), "a".into(), "b".into()],
        },
        LifecycleRequestV1::TrashMany {
            item_ids: vec!["中".into(), "a".into(), "a".into(), "".into()],
        },
    ];
    let mut requests = vec![request(RequestBody::Initialize)];
    requests.extend(inputs.iter().map(|input| {
        call(
            directory.path(),
            &CatalogInput::PrepareLiteratureLifecycle {
                request: input.clone(),
            },
        )
    }));
    requests.push(request(RequestBody::Shutdown));
    let originals = requests[1..8]
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
    for (index, input) in inputs.iter().enumerate() {
        let outcome = if index == 0 {
            LifecyclePreparationV1::Rejected {
                error: LifecycleRejectionV1 {
                    code: LifecycleRejectionCodeV1::NotFound,
                    message: "部分文献已归档、删除或不存在，请刷新后重试".into(),
                },
            }
        } else {
            LifecyclePreparationV1::Ready {
                request: input.clone(),
                trash_item_ids: if index == 6 {
                    vec!["".into(), "a".into(), "中".into()]
                } else {
                    vec![]
                },
            }
        };
        let actual = result(directory.path(), &replies[index + 1]);
        assert_eq!(
            actual.operation(),
            CatalogOperation::PrepareLiteratureLifecycle
        );
        assert_eq!(
            actual,
            CatalogOutput::LiteratureLifecyclePreparation { outcome }
        );
    }
    for (handle, bytes) in originals {
        assert_eq!(fs::read(directory.path().join(handle)).unwrap(), bytes);
    }
}
