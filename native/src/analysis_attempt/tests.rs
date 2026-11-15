use super::*;
use research_workbench_native_sdk::analysis_attempt::AnalysisAttemptTurnObservation as Turn;

fn turn(kind: &str, status: &str, numbers: &[i64]) -> Turn {
    Turn {
        id: format!(" raw-{kind} "),
        kind: kind.into(),
        status: status.into(),
        attempt_numbers: numbers.into(),
    }
}
fn workflow(turns: Vec<Turn>) -> AnalysisAttemptWorkflowObservation {
    AnalysisAttemptWorkflowObservation {
        status: "preparing".into(),
        turns,
    }
}

#[test]
fn both_original_turn_kinds_and_only_those_kinds_are_accepted() {
    for kind in ["paper_overview", "paper_concept_map"] {
        assert_eq!(validate_turn_kind(kind), Ok(()));
    }
    for kind in ["", "paper_overview ", "Paper_overview", "new_kind"] {
        assert_eq!(
            validate_turn_kind(kind),
            Err(AnalysisAttemptError::UnknownTurnKind)
        );
    }
}

#[test]
fn messages_keep_original_count_emptiness_and_raw_utf8_byte_limits() {
    assert_eq!(
        validate_message_contents(&[]),
        Err(AnalysisAttemptError::InvalidMessages)
    );
    assert!(validate_message_contents(&["message"; 8]).is_ok());
    assert_eq!(
        validate_message_contents(&["message"; 9]),
        Err(AnalysisAttemptError::InvalidMessages)
    );
    for empty in ["", " \t\n", "\u{3000}"] {
        assert_eq!(
            validate_message_contents(&[empty]),
            Err(AnalysisAttemptError::InvalidMessages)
        );
    }
    let ascii = "a".repeat(512_000);
    let unicode = "文".repeat(170_666) + "ab";
    assert_eq!(unicode.len(), 512_000);
    assert!(validate_message_contents(&[&ascii, &unicode, " \traw content\n"]).is_ok());
    for too_long in [ascii.clone() + "a", unicode + "文", format!(" {ascii}")] {
        assert_eq!(
            validate_message_contents(&[&too_long]),
            Err(AnalysisAttemptError::InvalidMessages)
        );
    }
}

#[test]
fn ended_workflow_and_canceled_overview_precede_turn_checks() {
    for (status, kind) in [
        ("superseded", "paper_overview"),
        ("superseded", "paper_concept_map"),
        ("canceled", "paper_overview"),
    ] {
        let state = AnalysisAttemptWorkflowObservation {
            status: status.into(),
            turns: vec![],
        };
        assert_eq!(
            plan_start_attempt(kind, &state),
            Err(AnalysisAttemptError::WorkflowEnded)
        );
    }
    let state = AnalysisAttemptWorkflowObservation {
        status: "superseded".into(),
        turns: vec![],
    };
    assert_eq!(
        plan_start_attempt("invalid", &state),
        Err(AnalysisAttemptError::UnknownTurnKind)
    );
}

#[test]
fn canceled_concept_retry_keeps_the_original_overview_prerequisite() {
    let mut state = workflow(vec![
        turn("paper_overview", "succeeded", &[1]),
        turn("paper_concept_map", "canceled", &[1]),
    ]);
    state.status = "canceled".into();
    assert_eq!(
        plan_start_attempt("paper_concept_map", &state)
            .unwrap()
            .next_attempt,
        2
    );
    state.turns[0].status = "failed".into();
    assert_eq!(
        plan_start_attempt("paper_concept_map", &state),
        Err(AnalysisAttemptError::OverviewRequired)
    );
}

#[test]
fn first_overview_is_used_and_prerequisite_failure_precedes_missing_requested_turn() {
    assert_eq!(
        plan_start_attempt("paper_concept_map", &workflow(vec![])),
        Err(AnalysisAttemptError::OverviewRequired)
    );
    let failed_first = workflow(vec![
        turn("paper_overview", "failed", &[]),
        turn("paper_overview", "succeeded", &[]),
        turn("paper_concept_map", "failed", &[]),
    ]);
    assert_eq!(
        plan_start_attempt("paper_concept_map", &failed_first),
        Err(AnalysisAttemptError::OverviewRequired)
    );
    let succeeded_first = workflow(vec![
        turn("paper_overview", "succeeded", &[]),
        turn("paper_overview", "failed", &[]),
        turn("paper_concept_map", "failed", &[]),
    ]);
    assert!(plan_start_attempt("paper_concept_map", &succeeded_first).is_ok());
    assert_eq!(
        plan_start_attempt(
            "paper_concept_map",
            &workflow(vec![turn("paper_overview", "succeeded", &[])])
        ),
        Err(AnalysisAttemptError::MissingTurn)
    );
    assert_eq!(
        plan_start_attempt("paper_overview", &workflow(vec![])),
        Err(AnalysisAttemptError::MissingTurn)
    );
}

#[test]
fn first_requested_turn_and_only_original_blocking_statuses_are_used() {
    for status in ["running", "succeeded"] {
        let state = workflow(vec![
            turn("paper_overview", status, &[]),
            turn("paper_overview", "failed", &[]),
        ]);
        assert_eq!(
            plan_start_attempt("paper_overview", &state),
            Err(AnalysisAttemptError::TurnUnavailable)
        );
    }
    for status in ["", "failed", "canceled", "interrupted", "unknown status"] {
        let mut state = workflow(vec![turn("paper_overview", status, &[])]);
        state.status = "unknown workflow status".into();
        state.turns[0].id = String::new();
        assert_eq!(
            plan_start_attempt("paper_overview", &state)
                .unwrap()
                .turn_id,
            ""
        );
    }
}

#[test]
fn next_attempt_is_original_last_plus_one_without_sorting_counting_or_range_normalization() {
    for (numbers, expected) in [
        (vec![], 1),
        (vec![99, 7], 8),
        (vec![-1], 0),
        (vec![0], 1),
        (vec![3, -2], -1),
    ] {
        let state = workflow(vec![turn("paper_overview", "failed", &numbers)]);
        let plan = plan_start_attempt("paper_overview", &state).unwrap();
        assert_eq!(plan.next_attempt, expected);
        assert_eq!(plan.turn_id, " raw-paper_overview ");
    }
}

#[cfg(debug_assertions)]
#[test]
#[should_panic(expected = "attempt to add with overflow")]
fn original_debug_addition_overflow_is_not_replaced_with_a_new_domain_rule() {
    let _ = plan_start_attempt(
        "paper_overview",
        &workflow(vec![turn("paper_overview", "failed", &[i64::MAX])]),
    );
}
