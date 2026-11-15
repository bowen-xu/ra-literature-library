use super::*;
use research_workbench_native_sdk::nal_annotation::NalAnnotation;

fn request() -> NalAnnotationRequest {
    NalAnnotationRequest {
        target_kind: "concept".into(),
        target_id: "concept".into(),
        title: "概念笔记".into(),
    }
}

fn existing(id: &str) -> NalAnnotation {
    NalAnnotation {
        id: id.into(),
        target_kind: "concept".into(),
        target_id: "concept".into(),
        note_page_id: format!("original-note-{id}"),
    }
}

fn snapshot(target_exists: bool) -> NalAnnotationSnapshot {
    NalAnnotationSnapshot {
        annotations: vec![],
        target_exists,
    }
}

#[test]
fn the_first_matching_identity_is_reused_before_target_existence_is_considered() {
    let first = existing("first");
    let wrong_kind = NalAnnotation {
        target_kind: "statement".into(),
        ..existing("other-kind")
    };
    let wrong_id = NalAnnotation {
        target_id: "different-concept".into(),
        ..existing("other-target")
    };
    let state = NalAnnotationSnapshot {
        annotations: vec![wrong_kind, wrong_id, first.clone(), existing("second")],
        target_exists: false,
    };
    assert_eq!(
        plan(request(), state).unwrap(),
        NalAnnotationPlan::Existing { annotation: first }
    );
}

#[test]
fn an_unmatched_annotation_does_not_hide_a_missing_target() {
    let state = NalAnnotationSnapshot {
        annotations: vec![NalAnnotation {
            target_kind: "statement".into(),
            ..existing("statement")
        }],
        target_exists: false,
    };
    let error = plan(request(), state).unwrap_err();
    assert_eq!(error, NalAnnotationError::TargetMissing);
    assert_eq!(error.to_string(), "笔记目标已不存在");
}

#[test]
fn create_retains_raw_identity_and_title_for_the_original_core_writer() {
    let request = NalAnnotationRequest {
        target_kind: "statement".into(),
        target_id: " \t原始目标 \n".into(),
        title: " \t原始标题 \n".into(),
    };
    assert_eq!(
        plan(request.clone(), snapshot(true)).unwrap(),
        NalAnnotationPlan::Create {
            target_kind: request.target_kind,
            target_id: request.target_id,
            title: request.title,
        }
    );
}

#[test]
fn target_limits_count_bytes_and_do_not_normalize_nonempty_identifiers() {
    for target_id in ["a".repeat(200), "é".repeat(100), "文".repeat(66) + "ab"] {
        let request = NalAnnotationRequest {
            target_id,
            ..request()
        };
        assert_eq!(request.target_id.len(), 200);
        assert!(validate_request(&request).is_ok());
    }
    for target_id in ["a".repeat(201), "é".repeat(101), "文".repeat(67)] {
        assert_eq!(
            validate_request(&NalAnnotationRequest {
                target_id,
                ..request()
            }),
            Err(NalAnnotationError::InvalidRequest)
        );
    }
    assert!(
        validate_request(&NalAnnotationRequest {
            target_id: " not-a-uuid ".into(),
            ..request()
        })
        .is_ok()
    );
}

#[test]
fn title_limits_count_three_hundred_unicode_scalars_including_outer_whitespace() {
    for title in ["文".repeat(300), "e\u{301}".repeat(150)] {
        assert_eq!(title.chars().count(), 300);
        let request = NalAnnotationRequest { title, ..request() };
        let NalAnnotationPlan::Create { title, .. } =
            plan(request.clone(), snapshot(true)).unwrap()
        else {
            panic!("existing Core title limits are not applied by the domain plan")
        };
        assert_eq!(title, request.title);
    }
    for title in ["文".repeat(301), format!(" {} ", "a".repeat(299))] {
        assert_eq!(
            validate_request(&NalAnnotationRequest { title, ..request() }),
            Err(NalAnnotationError::InvalidRequest)
        );
    }
}

#[test]
fn invalid_input_is_rejected_even_when_an_existing_annotation_would_match() {
    let state = NalAnnotationSnapshot {
        annotations: vec![existing("already-linked")],
        target_exists: true,
    };
    let error = plan(
        NalAnnotationRequest {
            title: "\u{3000}\t\n".into(),
            ..request()
        },
        state,
    )
    .unwrap_err();
    assert_eq!(error, NalAnnotationError::InvalidRequest);
    assert_eq!(error.to_string(), "笔记目标或标题无效");
    for target_kind in ["", "Concept", "concept ", "note"] {
        assert_eq!(
            validate_request(&NalAnnotationRequest {
                target_kind: target_kind.into(),
                ..request()
            }),
            Err(NalAnnotationError::InvalidRequest)
        );
    }
    for target_id in ["", " \t\n", "\u{3000}"] {
        assert_eq!(
            validate_request(&NalAnnotationRequest {
                target_id: target_id.into(),
                ..request()
            }),
            Err(NalAnnotationError::InvalidRequest)
        );
    }
}

#[test]
fn an_existing_note_reference_is_not_recreated_for_a_core_only_title_constraint() {
    let annotation = existing("trashed-note-reference");
    assert_eq!(
        plan(
            NalAnnotationRequest {
                title: "文".repeat(300),
                ..request()
            },
            NalAnnotationSnapshot {
                annotations: vec![annotation.clone()],
                target_exists: false
            },
        )
        .unwrap(),
        NalAnnotationPlan::Existing { annotation }
    );
}
