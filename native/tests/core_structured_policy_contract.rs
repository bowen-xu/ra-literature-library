use research_literature_library_native::structured_validation::structured;
use serde_json::json;

#[test]
fn core_transaction_rejection_fixture_is_rejected_by_the_domain_policy() {
    assert!(structured("structuredReading", json!({"kind":"wrong"}), &[]).is_err());
}

#[test]
fn core_portrait_rejection_fixture_retains_the_domain_field_path() {
    let claims = ["genre", "mode", "paradigm"].iter().map(|id| json!({"id":id,"dimension":id,"label":"不确定","description":"证据不足","certainty":"uncertain","evidence":[]})).collect::<Vec<_>>();
    let value = json!({"kind":"paper_portrait_v1","schemaVersion":1,"coverage":"已读摘录",
        "claims":claims,
        "template":[{"id":"question","title":"问题","question":"研究的问题","claimIds":["missing"]}]});
    let error = structured("portrait", value, &[]).unwrap_err();
    let research_workbench_native_sdk::candidate_contracts::CandidateValidationError::Validation {
        path,
        message,
    } = error
    else {
        panic!("domain field validation")
    };
    assert_eq!(path, "$.template[0].claimIds[0]");
    assert!(message.contains("不存在"));
}

#[test]
fn core_review_fixture_responses_match_the_public_selection_policy() {
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/core-review-selection-v1/cases.json")).unwrap();
    for case in cases.as_array().unwrap() {
        let pending: Vec<String> =
            serde_json::from_value(case["input"]["pending"].clone()).unwrap();
        let protected: Vec<String> =
            serde_json::from_value(case["input"]["protected"].clone()).unwrap();
        let reviewed: Vec<String> =
            serde_json::from_value(case["input"]["reviewed"].clone()).unwrap();
        assert_eq!(
            research_literature_library_native::review_selection::unreviewed_fields(
                &pending, &protected, &reviewed
            ),
            serde_json::from_value::<Vec<String>>(case["selected"].clone()).unwrap()
        );
    }
}

#[test]
fn partial_first_generation_without_candidate_metadata_is_rejected() {
    let value = json!({"fields":[{"field":"research_question","status":"filled","statements":[{"id":"question-1","text":"初次生成。","epistemicRole":"uncertain","evidenceItemIds":[]}]}]});
    assert!(structured("structuredReading", value, &[]).is_err());
}

#[test]
fn adopted_template_fact_requires_one_literal_quote_per_cited_source() {
    use research_workbench_native_sdk::candidate_contracts::EvidenceQuote;
    let evidence = [EvidenceQuote {
        citation_key: "anchor".into(),
        quote_exact: "A factual source sentence.".into(),
    }];
    for template in ["global-template", "own-template"] {
        let mut value = json!({"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"paper_template_v1",
            "paperTemplate":{"templateResourceId":template,"templateResourceRevision":1,"fields":[{"id":"research_question","title":"问题","question":"研究问题是什么？","claimIds":[]}]},
            "fields":[{"field":"research_question","status":"filled","statements":[{"id":"question-1","text":"A factual source sentence.","epistemicRole":"source_paraphrase","evidenceItemIds":["anchor"]}]}]});
        assert!(structured("structuredReading", value.clone(), &evidence).is_err());
        value["fields"][0]["statements"][0]["evidenceQuotes"] =
            json!([{"evidenceItemId":"anchor","quote":"A factual source sentence."}]);
        assert!(structured("structuredReading", value, &evidence).is_ok());
    }
}
