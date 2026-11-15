use super::*;
use research_workbench_native_sdk::analysis_workflow::research::ResearchEvidenceItemV1;
fn input() -> ResearchPromptInputV1 {
    let item = ResearchEvidenceItemV1 {
        citation_key: "ev-quote".into(),
        paper_id: "paper".into(),
        paper_title: "Synthetic Ω".into(),
        quote_exact: "Doe (2024). Grounded research systems.".into(),
        context_text: "Before \"quote\" Ω".into(),
        content_sha256: "a".repeat(64),
        page_index: 9,
        validation_status: "valid".into(),
    };
    ResearchPromptInputV1 {
        task_kind: "reference_extraction".into(),
        user_goal: "Goal Ω".into(),
        matrix_context: None,
        validation_status: "valid".into(),
        items: vec![
            item.clone(),
            ResearchEvidenceItemV1 {
                citation_key: "ev-context".into(),
                ..item
            },
        ],
    }
}
#[test]
fn original_reference_prompt_and_finite_wire_keep_fields_and_missing_identity_policy() {
    use research_workbench_native_sdk::{
        analysis_workflow::wire::*,
        paper_context_wire::{decode_payload, encode_payload},
    };
    let input = input();
    validate_bundle(&input).unwrap();
    let prompt = messages(&input).unwrap();
    assert!(prompt.system_text.contains("missing values stay absent"));
    let value: serde_json::Value = serde_json::from_str(&prompt.user_text).unwrap();
    assert_eq!(
        value,
        serde_json::json!({"task":"reference_record_candidate_v1","schemaVersion":1,"userGoal":"Goal Ω","evidenceTrust":"UNTRUSTED_EVIDENCE_DATA_ONLY","requirements":{"allowedFields":["title","authors","year","doi"],"identityVerificationForbidden":true,"missingFieldsStayAbsent":true,"citationField":"evidenceItemIds"},"evidence":input.items.iter().map(|item|serde_json::json!({"citationKey":item.citation_key,"paperId":item.paper_id,"paperTitle":item.paper_title,"quoteExact":item.quote_exact,"contextText":item.context_text,"attachmentSha256":item.content_sha256,"pageIndex":item.page_index})).collect::<Vec<_>>()})
    );
    let request = WorkflowInputV1::ResearchPrompt {
        input: Box::new(input),
    };
    let decision = crate::analysis_workflow::wire::dispatch(request.clone()).unwrap();
    assert!(request.matches_decision(&decision));
    assert_eq!(
        decision,
        decode_payload::<WorkflowDecisionV1>(&encode_payload(&decision).unwrap()).unwrap()
    );
    assert!(
        matches!(decision,WorkflowDecisionV1::ResearchPrompt{result:Ok(result)} if result==prompt)
    );
}
#[test]
fn original_research_integrity_rejects_bad_count_status_empty_quote_or_hash() {
    for kind in ["reference_extraction", "matrix_synthesis", "unknown"] {
        for change in 0..5 {
            let mut value = input();
            value.task_kind = kind.into();
            match change {
                0 => value.items.clear(),
                1 => value.validation_status = "invalid".into(),
                2 => value.items[0].validation_status = "invalid".into(),
                3 => value.items[0].quote_exact = " \n".into(),
                _ => value.items[0].content_sha256 = "short".into(),
            }
            assert_eq!(
                validate_bundle(&value).unwrap_err().to_string(),
                "研究候选 Evidence Bundle 未通过完整性验证"
            );
        }
    }
    let mut value = input();
    value.task_kind = "matrix_synthesis".into();
    validate_bundle(&value).unwrap();
    assert_eq!(
        messages(&value).unwrap_err().to_string(),
        "综合运行缺少冻结矩阵上下文"
    );
}
