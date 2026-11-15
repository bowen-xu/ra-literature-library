use super::support::*;
use research_workbench_native_sdk::{
    candidate_contracts::{CandidateValidationError as Error, EvidenceQuote},
    catalog::{CatalogInput, CatalogOperation},
    literature_trace_protocol::RequestBody,
    structured_validation::{
        StructuredTargetV1 as Target, StructuredValidationInputV1 as Input,
        StructuredValidationOutcomeV1 as Outcome,
    },
};
use serde_json::{Value, json};
use std::fs;

#[path = "fixture.rs"]
mod fixture;
use fixture::{call, run};

fn overview() -> Value {
    json!({"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"generic_overview_v1",
      "fields":(["research_question","approach","key_result","conclusion","limitation","open_question"]
        .map(|field|json!({"field":field,"status":"not_found","statements":[]})))})
}
fn portrait() -> Value {
    json!({"kind":"paper_portrait_v1","schemaVersion":1,"coverage":"原 supplied scope.",
      "claims":(["genre","mode","paradigm"].map(|dimension|json!({"id":format!("claim_{dimension}"),"dimension":dimension,
        "label":"判断","description":"原判断","certainty":"supported","evidence":[{"evidenceItemId":"E1","quote":"second exact"}]}))),
      "template":[{"id":"question","title":"问题","question":"原问题?","claimIds":["claim_genre"]}]})
}
fn input(target: Target, value: Value) -> Input {
    Input {
        target,
        candidate_json: value.to_string(),
        evidence: vec![
            EvidenceQuote {
                citation_key: "E1".into(),
                quote_exact: "first frozen quote".into(),
            },
            EvidenceQuote {
                citation_key: "E1".into(),
                quote_exact: "second exact quote\n原文".into(),
            },
        ],
    }
}
fn rejected(actual: &Outcome, input: &Input, expected: &Error) {
    assert!(
        matches!(actual,Outcome::Rejected{input:original,error} if original.as_ref()==input && error==expected)
    );
}

#[test]
fn real_child_normalizes_candidates_preserves_duplicate_quotes_and_keeps_domain_failures_healthy() {
    let directory = tempfile::tempdir().unwrap();
    let mut valid = overview();
    valid["fields"][0] = json!({"field":"research_question","status":"filled","statements":[
      {"id":" s1 ","text":"  PRIVATE_BODY_731 原\n文  ","epistemicRole":"source_paraphrase","evidenceItemIds":["E1"],
       "evidenceQuotes":[{"evidenceItemId":"E1","quote":"second exact"}]}]});
    let inputs = [
        input(Target::Overview, valid.clone()),
        input(Target::Portrait, portrait()),
        input(
            Target::Overview,
            json!({"kind":"paper_portrait_v1","coverage":null}),
        ),
        input(Target::Overview, portrait()),
        input(Target::Overview, {
            let mut v = valid.clone();
            v["fields"][0]["statements"][0]["epistemicRole"] = json!("unknown");
            v["fields"][0]["statements"][0]["evidenceItemIds"] = json!(["absent"]);
            v["fields"][0]["statements"][0]["evidenceQuotes"] = json!([]);
            v
        }),
        input(Target::Overview, {
            let mut v = valid.clone();
            v["fields"][0]["statements"][0]["evidenceQuotes"][0]["quote"] = json!("rewritten");
            v
        }),
        input(Target::Overview, overview()),
    ];
    let actual = run(directory.path(), &inputs);
    let Outcome::Validated {
        input: original,
        canonical_json,
    } = &actual[0]
    else {
        panic!("normalized overview")
    };
    assert_eq!(original.as_ref(), &inputs[0]);
    let normalized: Value = serde_json::from_str(canonical_json).unwrap();
    assert_eq!(normalized["fields"][0]["statements"][0]["id"], "s1");
    assert_eq!(
        normalized["fields"][0]["statements"][0]["text"],
        "PRIVATE_BODY_731 原\n文"
    );
    assert!(
        matches!(&actual[1],Outcome::Validated{input:original,..} if original.as_ref()==&inputs[1])
    );
    assert!(
        matches!(&actual[2],Outcome::Rejected{input:original,error:Error::Validation{path,message}} if original.as_ref()==&inputs[2] && path=="$" && message.contains("画像 JSON 字段类型或必填字段错误"))
    );
    rejected(
        &actual[3],
        &inputs[3],
        &Error::Validation {
            path: "$.kind".into(),
            message: "内容类型与目标资源不匹配".into(),
        },
    );
    rejected(
        &actual[4],
        &inputs[4],
        &Error::InvalidInput("候选包含未知的认识角色".into()),
    );
    rejected(
        &actual[5],
        &inputs[5],
        &Error::InvalidInput("结构化陈述 s1 的摘录不是来源 E1 中的连续原文".into()),
    );
    assert!(
        matches!(&actual[6],Outcome::Validated{input:original,..} if original.as_ref()==&inputs[6])
    );
}

fn nested_candidate(depth: usize) -> String {
    format!(
        "{{\"kind\":\"unsupported\",\"nested\":{}0{}}}",
        "[".repeat(depth),
        "]".repeat(depth)
    )
}

#[test]
fn real_child_string_leaf_retains_the_actual_hbs_parser_depth_boundary() {
    // HBS validate_inner first uses the same ordinary Value parser. The leaf
    // encoding must not subtract Catalog's wrapper levels from that budget.
    let mut depth = 0;
    while serde_json::from_str::<Value>(&nested_candidate(depth + 1)).is_ok() {
        depth += 1;
    }
    assert!(depth > 100);
    let mut input = input(Target::Overview, overview());
    input.candidate_json = nested_candidate(depth);
    assert!(serde_json::from_str::<Value>(&input.candidate_json).is_ok());
    let directory = tempfile::tempdir().unwrap();
    let actual = run(directory.path(), std::slice::from_ref(&input));
    rejected(
        &actual[0],
        &input,
        &Error::InvalidInput("候选 kind 不受支持".into()),
    );
}

#[test]
fn real_child_classifies_malformed_inner_json_as_protocol_input_without_echoing_body() {
    let mut input = input(Target::Overview, overview());
    input.candidate_json = "{PRIVATE_BODY_731 malformed".into();
    let directory = tempfile::tempdir().unwrap();
    let wire = CatalogInput::ValidateStructured {
        input: Box::new(input.clone()),
    };
    assert_eq!(wire.operation(), CatalogOperation::ValidateStructured);
    assert!(matches!(research_literature_library_native::catalog::dispatch(wire),Err(research_literature_library_native::catalog::CatalogDecodeError::InvalidStructuredValidationInput)));
    let request = call(directory.path(), &input);
    let RequestBody::Catalog { snapshot, .. } = &request.body else {
        unreachable!()
    };
    let original = fs::read(directory.path().join(&snapshot.relative_handle)).unwrap();
    let output = execute_requests(directory.path(), &session(request));
    assert!(!output.status.success());
    let diagnostic = String::from_utf8_lossy(&output.stderr);
    assert!(diagnostic.contains("snapshot_invalid"));
    assert!(!diagnostic.contains("PRIVATE_BODY_731"));
    assert!(!diagnostic.contains(directory.path().to_str().unwrap()));
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    assert_eq!(
        fs::read_dir(directory.path())
            .unwrap()
            .next()
            .map(|p| fs::read(p.unwrap().path()).unwrap()),
        Some(original)
    );
}
