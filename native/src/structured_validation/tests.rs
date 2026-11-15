use super::*;
use serde_json::json;

fn portrait(quote: &str) -> Value {
    json!({"kind":"paper_portrait_v1","schemaVersion":1,"coverage":"Selected excerpts only.",
        "claims":(["genre","mode","paradigm"].iter().enumerate().map(|(index,dimension)|json!({"id":format!("claim_{index}"),
            "dimension":dimension,"label":"Classification","description":"Grounded description","certainty":"supported",
            "evidence":[{"evidenceItemId":"E1","quote":quote}]})).collect::<Vec<_>>()),
        "template":[{"id":"question","title":"Question","question":"Which question?","claimIds":["claim_0"]}]})
}

#[test]
fn malformed_other_kind_keeps_decoder_error_before_target_mismatch() {
    let mut value = json!({"kind":"selection_explanation_v1","schemaVersion":1,"statements":[],"uncertainties":[]});
    assert_eq!(
        structured("portrait", value.clone(), &[]).unwrap_err(),
        AiError::InvalidInput("候选原子陈述数量无效".into())
    );
    value["statements"] = json!([{"id":"statement","text":"uncertain","epistemicRole":"uncertain","evidenceItemIds":[]}]);
    assert_eq!(
        structured("portrait", value, &[]).unwrap_err(),
        AiError::Validation {
            path: "$.kind".into(),
            message: "内容类型与目标资源不匹配".into()
        }
    );
}

#[test]
fn duplicate_evidence_keys_keep_any_literal_match_without_normalizing_quotes() {
    let quote = "原文🙂\r\n  exact";
    let evidence = vec![
        EvidenceQuote {
            citation_key: "E1".into(),
            quote_exact: "first does not match".into(),
        },
        EvidenceQuote {
            citation_key: "E1".into(),
            quote_exact: format!("prefix {quote} suffix"),
        },
    ];
    let value = portrait(quote);
    assert_eq!(
        structured("portrait", value.clone(), &evidence).unwrap(),
        value
    );
    let altered = portrait("原文🙂 exact");
    assert!(
        matches!(structured("portrait", altered, &evidence), Err(AiError::Validation {path,..}) if path=="$.claims[0].evidence[0].quote")
    );
}

#[test]
fn template_quotes_keep_original_long_text_and_optional_omission() {
    let quote = "原文🙂".repeat(500);
    let evidence = vec![EvidenceQuote {
        citation_key: "E1".into(),
        quote_exact: quote.clone(),
    }];
    let value = json!({"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"paper_template_v1","profileRefs":null,
        "paperTemplate":{"templateResourceId":"template","templateResourceRevision":2,
        "fields":[{"id":"question","title":"问题","question":"哪一个问题？","claimIds":[],"color":null}]},
        "fields":[{"field":"question","status":"filled","statements":[{"id":" statement ","text":" content ","epistemicRole":"source_paraphrase",
            "evidenceItemIds":["E1"],"evidenceQuotes":[{"evidenceItemId":"E1","quote":quote}]}]}]});
    let checked = structured("structuredReading", value, &evidence).unwrap();
    assert_eq!(checked["fields"][0]["statements"][0]["text"], "content");
    assert_eq!(checked["fields"][0]["statements"][0]["id"], "statement");
    assert_eq!(
        checked["fields"][0]["statements"][0]["evidenceQuotes"][0]["quote"],
        quote
    );
    assert!(checked.get("profileRefs").is_none());
    assert!(checked["paperTemplate"]["fields"][0].get("color").is_none());
}
