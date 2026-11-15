use super::*;
use research_workbench_native_sdk::{analysis_attempt::*, analysis_workflow::wire::*};

fn turn(id: &str, attempts: Vec<i64>) -> AnalysisAttemptTurnObservation {
    AnalysisAttemptTurnObservation {
        id: id.into(),
        kind: "paper_overview".into(),
        status: "failed".into(),
        attempt_numbers: attempts,
    }
}
#[test]
fn attempt_input_validation_retains_original_error_order_and_utf8_byte_limit() {
    for (kind, contents, message) in [
        ("invalid", vec![], "未知论文分析阶段"),
        ("paper_overview", vec![], "论文分析规范化消息为空或超过上限"),
        (
            "paper_overview",
            vec!["中".repeat(170_667)],
            "论文分析规范化消息为空或超过上限",
        ),
    ] {
        let input = WorkflowInputV1::ValidateAttemptInput {
            turn_kind: kind.into(),
            contents,
        };
        let output = wire::dispatch(input.clone()).unwrap();
        assert!(input.matches_decision(&output));
        assert_eq!(
            output,
            WorkflowDecisionV1::Validated {
                rejection: Some(AnalysisWorkflowError::InvalidInput(message.into()))
            }
        );
    }
    let input = WorkflowInputV1::ValidateAttemptInput {
        turn_kind: "paper_overview".into(),
        contents: vec!["中".repeat(170_666)],
    };
    assert_eq!(
        wire::dispatch(input).unwrap(),
        WorkflowDecisionV1::Validated { rejection: None }
    );
}
#[test]
fn attempt_plan_preserves_first_turn_last_observed_attempt_and_missing_turn_category() {
    let mut workflow = AnalysisAttemptWorkflowObservation {
        status: "preparing".into(),
        turns: vec![turn("first", vec![8, -2]), turn("second", vec![99])],
    };
    let input = WorkflowInputV1::PlanAttempt {
        turn_kind: "paper_overview".into(),
        workflow: workflow.clone(),
    };
    let output = wire::dispatch(input.clone()).unwrap();
    assert!(input.matches_decision(&output));
    assert_eq!(
        output,
        WorkflowDecisionV1::AttemptPlan {
            result: Ok(AnalysisAttemptPlan {
                turn_id: "first".into(),
                next_attempt: -1
            })
        }
    );
    assert!(!input.matches_decision(&WorkflowDecisionV1::AttemptPlan {
        result: Ok(AnalysisAttemptPlan {
            turn_id: "second".into(),
            next_attempt: 100
        })
    }));
    workflow.turns.clear();
    assert_eq!(
        wire::dispatch(WorkflowInputV1::PlanAttempt {
            turn_kind: "paper_overview".into(),
            workflow
        })
        .unwrap(),
        WorkflowDecisionV1::AttemptPlan {
            result: Err(AnalysisWorkflowError::TemporaryUnavailable)
        }
    );
}

#[test]
fn legacy_attempt_prompt_keeps_only_task_messages_and_preserves_original_text() {
    use research_workbench_native_sdk::{
        analysis_history::contracts::{PaperAnalysisMessage, PaperAnalysisMessageKind as Kind},
        analysis_workflow::prompt::PaperTaskPrompt,
        paper_context_wire::decode_payload,
    };
    let input = WorkflowInputV1::RenderAttemptMessages {
        messages: vec![
            PaperAnalysisMessage::new(Kind::SystemContext, "excluded system"),
            PaperAnalysisMessage::new(Kind::TaskPrompt, " first Ω\n"),
            PaperAnalysisMessage::new(Kind::AssistantCandidate, "excluded candidate"),
            PaperAnalysisMessage::new(Kind::TaskPrompt, "second"),
            PaperAnalysisMessage::new(Kind::Transition, "excluded transition"),
        ],
    };
    let decision = wire::dispatch(input.clone()).unwrap();
    assert!(input.matches_decision(&decision));
    let WorkflowDecisionV1::Prompt { result_cbor_base64 } = decision else {
        panic!("prompt result");
    };
    let result: Result<PaperTaskPrompt, AnalysisWorkflowError> =
        decode_payload(&result_cbor_base64).unwrap();
    let prompt = result.unwrap();
    assert_eq!(prompt.text, " first Ω\n\n\nsecond");
    assert_eq!(
        prompt.user_input,
        vec![research_agent_api::user_input::UserInput::Text {
            text: prompt.text,
            text_elements: vec![]
        }]
    );
}
