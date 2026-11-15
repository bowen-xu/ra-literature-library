use super::*;
fn anchor() -> AnchorEvidence {
    AnchorEvidence {
        anchor_id: "anchor".into(),
        paper_id: "paper".into(),
        paper_title: "Synthetic Ω".into(),
        attachment_id: "attachment".into(),
        content_sha256: "a".repeat(64),
        page_index: 9,
        page_label: Some("x".into()),
        quote_exact: "Doe (2024). Grounded research systems.".into(),
        quote_prefix: "Before Ω ".into(),
        quote_suffix: " after.".into(),
    }
}
#[test]
fn original_selection_keys_order_and_unmodified_context_round_trip() {
    use research_workbench_native_sdk::{
        analysis_workflow::wire::*,
        paper_context_wire::{decode_payload, encode_payload},
    };
    let source = anchor();
    let input = WorkflowInputV1::SelectionEvidence {
        source: Some(source.clone()),
    };
    let decision = crate::analysis_workflow::wire::dispatch(input.clone()).unwrap();
    assert!(input.matches_decision(&decision));
    let encoded = encode_payload(&decision).unwrap();
    assert_eq!(
        decision,
        decode_payload::<WorkflowDecisionV1>(&encoded).unwrap()
    );
    let WorkflowDecisionV1::SelectionEvidence { result } = decision else {
        panic!("wrong family")
    };
    let items = result.unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(
        (
            &*items[0].citation_key,
            &*items[0].relation_kind,
            &*items[0].context_text
        ),
        ("ev-quote", "direct_quote", source.quote_exact.as_str())
    );
    assert_eq!(
        (&*items[1].citation_key, &*items[1].relation_kind),
        ("ev-context", "context")
    );
    assert_eq!(
        items[1].context_text,
        format!(
            "{}{}{}",
            source.quote_prefix, source.quote_exact, source.quote_suffix
        )
    );
    let mut wrong = items.clone();
    wrong[0].content_sha256 = "b".repeat(64);
    assert!(!input.matches_decision(&WorkflowDecisionV1::SelectionEvidence { result: Ok(wrong) }));
    assert!(
        !input.matches_decision(&WorkflowDecisionV1::SelectionEvidence {
            result: Ok(vec![items[0].clone()])
        })
    );
}
#[test]
fn original_unicode_quote_context_budgets_and_error_order_hold() {
    assert_eq!(
        preview(None).unwrap_err().to_string(),
        "原文锚点或对应附件版本已不可用"
    );
    let mut value = anchor();
    value.quote_exact = " \n ".into();
    value.quote_prefix = "Ω".repeat(12001);
    assert_eq!(
        preview(Some(value.clone())).unwrap_err().to_string(),
        "AI 选区解释要求非空的精确原文引用"
    );
    value.quote_exact = "Ω".repeat(1501);
    assert!(
        preview(Some(value.clone()))
            .unwrap_err()
            .to_string()
            .contains("1,500")
    );
    value.quote_exact = "Ω".repeat(1500);
    value.quote_prefix = "Ω".repeat(10500);
    value.quote_suffix.clear();
    assert_eq!(
        preview(Some(value.clone())).unwrap()[1]
            .context_text
            .chars()
            .count(),
        12000
    );
    value.quote_suffix.push('Ω');
    assert!(
        preview(Some(value))
            .unwrap_err()
            .to_string()
            .contains("12,000")
    );
}
