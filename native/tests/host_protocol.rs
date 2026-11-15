#![cfg(unix)]
#[path = "context_metadata_host/tests.rs"]
mod context_metadata;
#[path = "duplicate_host/tests.rs"]
mod duplicate_review;
#[path = "editable_template_host/tests.rs"]
mod editable_template;
#[path = "paper_context_host/tests.rs"]
mod paper_context;
#[path = "review_selection_host/tests.rs"]
mod review_selection;
#[path = "structured_validation_host/tests.rs"]
mod structured_validation;
mod support;
#[path = "trash_cleanup_host/tests.rs"]
mod trash_cleanup;

use research_literature_library_native::retrieval_trace::hash;
use research_workbench_native_sdk::{
    literature_trace_protocol::{
        self as protocol, RequestBody, ResponseBody, SnapshotInput, TraceDecision,
    },
    retrieval_trace::{MarkSentCondition, TraceRejection},
};
use serde_json::{Value, json};
use std::{fs, os::unix::fs::symlink};
use support::*;

fn decision(response: &protocol::Response) -> &TraceDecision {
    let ResponseBody::NoteTraceDecision { decision } = &response.body else {
        panic!("expected decision")
    };
    decision
}

#[test]
fn real_child_reads_original_trace_without_writes_and_returns_frozen_condition() {
    let directory = tempfile::tempdir().unwrap();
    let input = SnapshotInput {
        query: "  原问题\t ".into(),
        row: Some(row()),
    };
    let decide = snapshot(directory.path(), &input);
    let RequestBody::DecideNoteTrace {
        snapshot: reference,
    } = &decide.body
    else {
        unreachable!()
    };
    let path = directory.path().join(&reference.relative_handle);
    let original_bytes = fs::read(&path).unwrap();
    let requests = session(decide);
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    assert_eq!(
        decision(&replies[1]),
        &TraceDecision::Ready {
            mark_sent: MarkSentCondition::ORIGINAL
        }
    );
    assert_eq!(fs::read(&path).unwrap(), original_bytes);
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    assert!(output.stdout.len() < 2048);
}

#[test]
fn five_original_rejections_keep_order_and_do_not_poison_the_same_instance() {
    let directory = tempfile::tempdir().unwrap();
    let mut requests = vec![request(RequestBody::Initialize)];
    let mut wrong_scope = row();
    wrong_scope.paper_id = Some(" raw paper ".into());
    wrong_scope.status = "sent".into();
    let mut consumed = row();
    consumed.status = "sent".into();
    consumed.expired = true;
    let mut expired = row();
    expired.expired = true;
    expired.context_sha256 = "wrong".into();
    let mut tampered = row();
    tampered.context_sha256 = "wrong".into();
    for row in [
        None,
        Some(wrong_scope),
        Some(consumed),
        Some(expired),
        Some(tampered),
        Some(row()),
    ] {
        requests.push(snapshot(
            directory.path(),
            &SnapshotInput {
                query: "原问题".into(),
                row,
            },
        ));
    }
    requests.push(request(RequestBody::Shutdown));
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    for (reply, reason) in replies[1..6].iter().zip([
        TraceRejection::NotFound,
        TraceRejection::QueryMismatch,
        TraceRejection::AlreadyConsumed,
        TraceRejection::Expired,
        TraceRejection::ContextHashMismatch,
    ]) {
        assert_eq!(decision(reply), &TraceDecision::Rejected { reason });
    }
    assert_eq!(
        decision(&replies[6]),
        &TraceDecision::Ready {
            mark_sent: MarkSentCondition::ORIGINAL
        }
    );
    assert!(
        replies
            .iter()
            .all(|reply| reply.instance_id == requests[0].instance_id)
    );
}

#[test]
fn real_child_rejects_lifecycle_version_identity_and_extra_authority() {
    let directory = tempfile::tempdir().unwrap();
    let before_init = execute_requests(directory.path(), &[request(RequestBody::Shutdown)]);
    assert!(!before_init.status.success());
    assert!(before_init.stdout.is_empty());
    let duplicate_init = execute_requests(
        directory.path(),
        &[
            request(RequestBody::Initialize),
            request(RequestBody::Initialize),
        ],
    );
    assert!(!duplicate_init.status.success());
    assert_eq!(
        duplicate_init
            .stdout
            .iter()
            .filter(|byte| **byte == b'\n')
            .count(),
        1
    );
    for field in ["packageKey", "instanceId"] {
        let init = request(RequestBody::Initialize);
        let mut shutdown = serde_json::to_value(request(RequestBody::Shutdown)).unwrap();
        shutdown[field] = if field == "packageKey" {
            json!("b".repeat(64))
        } else {
            json!("590c18c0-52f2-4905-8e39-23e082778384")
        };
        let mut bytes = protocol::encode_request(&init).unwrap();
        bytes.extend(serde_json::to_vec(&shutdown).unwrap());
        bytes.push(b'\n');
        let output = execute(directory.path(), &bytes);
        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("identity_mismatch"));
    }
    for mutate in [
        |value: &mut Value| value["protocolVersion"] = json!(1),
        |value: &mut Value| value["body"]["kind"] = json!("executeSql"),
        |value: &mut Value| value["body"]["sql"] = json!("PRIVATE_SQL_883"),
        |value: &mut Value| value["body"]["contextText"] = json!("PRIVATE_BODY_883"),
    ] {
        let mut value = serde_json::to_value(request(RequestBody::Initialize)).unwrap();
        mutate(&mut value);
        let mut bytes = serde_json::to_vec(&value).unwrap();
        bytes.push(b'\n');
        let output = execute(directory.path(), &bytes);
        assert!(!output.status.success());
        assert!(output.stdout.is_empty());
        let diagnostic = String::from_utf8_lossy(&output.stderr);
        assert!(!diagnostic.contains("PRIVATE_"));
        assert!(!diagnostic.contains(directory.path().to_str().unwrap()));
    }
}

#[test]
fn rejects_missing_malformed_changed_and_non_regular_snapshots_without_leaking_content() {
    let directory = tempfile::tempdir().unwrap();
    let input = SnapshotInput {
        query: "PRIVATE_QUERY_883".into(),
        row: Some(row()),
    };
    for problem in [
        "missing",
        "size",
        "hash",
        "malformed",
        "authority",
        "directory",
        "symlink",
    ] {
        let mut decide = snapshot(directory.path(), &input);
        let RequestBody::DecideNoteTrace {
            snapshot: reference,
        } = &mut decide.body
        else {
            unreachable!()
        };
        let path = directory.path().join(&reference.relative_handle);
        match problem {
            "missing" => fs::remove_file(&path).unwrap(),
            "size" => reference.byte_size += 1,
            "hash" => reference.sha256 = "f".repeat(64),
            "malformed" | "authority" => {
                fs::remove_file(&path).unwrap();
                let bytes = if problem == "malformed" {
                    b"PRIVATE_BODY_883".to_vec()
                } else {
                    br#"{"query":"PRIVATE_QUERY_883","row":null,"sql":"PRIVATE_SQL_883"}"#.to_vec()
                };
                reference.byte_size = bytes.len() as u64;
                reference.sha256 = hash(std::str::from_utf8(&bytes).unwrap());
                fs::write(&path, bytes).unwrap();
            }
            "directory" => {
                fs::remove_file(&path).unwrap();
                fs::create_dir(&path).unwrap();
            }
            "symlink" => {
                // A followed link would allow a complete protocol session.
                // Rejection must therefore come from the final-leaf boundary,
                // rather than an unrelated size/hash/JSON failure.
                let valid_bytes = fs::read(&path).unwrap();
                fs::remove_file(&path).unwrap();
                let outside = directory.path().join("private-target.json");
                fs::write(&outside, valid_bytes).unwrap();
                symlink(outside, &path).unwrap();
            }
            _ => unreachable!(),
        }
        let output = execute_requests(directory.path(), &session(decide));
        assert!(!output.status.success(), "{problem}");
        assert_eq!(
            output.stdout.iter().filter(|byte| **byte == b'\n').count(),
            1,
            "{problem}"
        );
        let diagnostic = String::from_utf8_lossy(&output.stderr);
        assert!(
            diagnostic.contains("literature_host_snapshot_"),
            "{diagnostic}"
        );
        assert!(!diagnostic.contains("PRIVATE_"));
        assert!(!diagnostic.contains(directory.path().to_str().unwrap()));
    }
}

#[test]
fn request_bound_filename_and_complete_snapshot_binding_are_mandatory_in_real_child() {
    let directory = tempfile::tempdir().unwrap();
    let original = snapshot(
        directory.path(),
        &SnapshotInput {
            query: "原问题".into(),
            row: Some(row()),
        },
    );
    for (field, value) in [
        ("relativeHandle", json!("../PRIVATE_PATH_883")),
        ("packageKey", json!("b".repeat(64))),
        ("instanceId", json!("590c18c0-52f2-4905-8e39-23e082778384")),
        ("requestId", json!("590c18c0-52f2-4905-8e39-23e082778384")),
    ] {
        let mut value_request = serde_json::to_value(&original).unwrap();
        value_request["body"]["snapshot"][field] = value;
        let mut bytes = protocol::encode_request(&request(RequestBody::Initialize)).unwrap();
        bytes.extend(serde_json::to_vec(&value_request).unwrap());
        bytes.push(b'\n');
        let output = execute(directory.path(), &bytes);
        assert!(!output.status.success());
        assert_eq!(
            output.stdout.iter().filter(|byte| **byte == b'\n').count(),
            1
        );
        assert!(!String::from_utf8_lossy(&output.stderr).contains("PRIVATE_"));
    }
}

#[test]
fn shutdown_and_eof_do_not_allow_an_unacknowledged_session_or_extra_work() {
    let directory = tempfile::tempdir().unwrap();
    let output = execute_requests(directory.path(), &[request(RequestBody::Initialize)]);
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("closed_before_shutdown"));
    let requests = [
        request(RequestBody::Initialize),
        request(RequestBody::Shutdown),
        request(RequestBody::Initialize),
    ];
    let output = execute_requests(directory.path(), &requests);
    assert!(!output.status.success());
    assert_eq!(
        output.stdout.iter().filter(|byte| **byte == b'\n').count(),
        1
    );
    assert!(String::from_utf8_lossy(&output.stderr).contains("lifecycle_invalid"));
}

#[test]
fn nul_input_larger_than_frame_keeps_original_scope_status_expiry_and_hash_order() {
    let directory = tempfile::tempdir().unwrap();
    let mut original = row();
    original.context_text = "\0".to_owned() + &"x".repeat(protocol::MAX_FRAME_BYTES + 1);
    original.context_sha256 = hash(&original.context_text);
    let mut requests = vec![request(RequestBody::Initialize)];
    for state in ["scope", "status", "expiry", "hash", "ready"] {
        let mut observed = original.clone();
        match state {
            "scope" => {
                observed.paper_id = Some(" raw paper ".into());
                observed.status = "sent".into();
                observed.expired = true;
                observed.context_sha256 = "wrong".into();
            }
            "status" => {
                observed.status = "sent".into();
                observed.expired = true;
                observed.context_sha256 = "wrong".into();
            }
            "expiry" => {
                observed.expired = true;
                observed.context_sha256 = "wrong".into();
            }
            "hash" => observed.context_sha256 = "wrong".into(),
            "ready" => {}
            _ => unreachable!(),
        }
        let decide = snapshot(
            directory.path(),
            &SnapshotInput {
                query: "原问题".into(),
                row: Some(observed),
            },
        );
        let RequestBody::DecideNoteTrace { snapshot } = &decide.body else {
            unreachable!()
        };
        assert!(snapshot.byte_size > protocol::MAX_FRAME_BYTES as u64);
        requests.push(decide);
    }
    requests.push(request(RequestBody::Shutdown));
    let output = execute_requests(directory.path(), &requests);
    let replies = responses(&output, &requests);
    for (reply, reason) in replies[1..5].iter().zip([
        TraceRejection::QueryMismatch,
        TraceRejection::AlreadyConsumed,
        TraceRejection::Expired,
        TraceRejection::ContextHashMismatch,
    ]) {
        assert_eq!(decision(reply), &TraceDecision::Rejected { reason });
    }
    assert_eq!(
        decision(&replies[5]),
        &TraceDecision::Ready {
            mark_sent: MarkSentCondition::ORIGINAL
        }
    );
    assert!(output.stdout.len() < 8192);
}
