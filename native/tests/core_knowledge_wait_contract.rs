use research_literature_library_native::knowledge_promotion::decide;
use research_workbench_native_sdk::knowledge_promotion::{
    KnowledgeValidationDecisionV1, KnowledgeValidationInputV1,
};
use serde_json::Value;

#[test]
fn recorded_core_knowledge_wait_responses_match_the_public_domain_policy() {
    let groups: Value = serde_json::from_str(include_str!(
        "fixtures/core-knowledge-wait-v1/decisions.json"
    ))
    .unwrap();
    let mut cases = 0;
    for (group, rows) in groups.as_object().unwrap() {
        for row in rows.as_array().unwrap() {
            let expected: KnowledgeValidationDecisionV1 =
                serde_json::from_value(row["decision"].clone()).unwrap();
            // Core owns these opaque read-set digests. The recorded inputs omit
            // them, so test both fixed bindings against the same domain response.
            for byte in [0_u8, 255] {
                let mut input = row["input"].clone();
                let fields: &[&str] = match input["kind"].as_str().unwrap() {
                    "evolutionEvents" | "identityTarget" | "identitySnapshot"
                    | "identitySplitEvent" => &["snapshotSha256"],
                    "relationEndpoints" => &["subjectSha256", "objectSha256"],
                    "relationRevision" => &["currentSha256"],
                    "manualDefinition" => &["conceptIdentitySha256"],
                    _ => &[],
                };
                for field in fields {
                    input[*field] = serde_json::to_value([byte; 32]).unwrap();
                }
                let input: KnowledgeValidationInputV1 = serde_json::from_value(input).unwrap();
                assert_eq!(decide(&input), expected, "recorded group {group}");
            }
            cases += 1;
        }
    }
    assert_eq!(cases, 25);
}
