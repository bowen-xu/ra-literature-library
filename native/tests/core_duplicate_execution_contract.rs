use research_literature_library_native::{duplicate_undo, nal_bootstrap};
use research_workbench_native_sdk::duplicate_undo::UndoMergePrepareInputV1;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[test]
fn recorded_core_duplicate_policy_inputs_keep_the_public_domain_results() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("fixtures/core-duplicate-policy-v1/cases.json")).unwrap();
    for case in cases {
        let input = &case["input"];
        let mut expected = case["output"].clone();
        let actual = match case["kind"].as_str().unwrap() {
            "undo" => {
                let snapshot_json = input.to_string();
                expected["snapshotSha256"] =
                    json!(format!("{:x}", Sha256::digest(snapshot_json.as_bytes())));
                serde_json::to_value(
                    duplicate_undo::prepare(&UndoMergePrepareInputV1 { snapshot_json }).unwrap(),
                )
                .unwrap()
            }
            "space" => json!(nal_bootstrap::embedding_space_id(
                input[0].as_str().unwrap(),
                input[1].as_str().unwrap(),
            )),
            "row" => json!(nal_bootstrap::stable_row_id(
                input[0].as_str().unwrap(),
                input[1].as_str().unwrap(),
                input[2].as_i64().unwrap(),
            )),
            "render" => json!(
                nal_bootstrap::render_concept(&serde_json::from_value(input.clone()).unwrap())
                    .unwrap()
            ),
            kind => panic!("unknown recorded contract: {kind}"),
        };
        assert_eq!(actual, expected, "{}", case["kind"]);
    }
}

#[test]
fn core_identity_binding_preserves_the_recorded_domain_decision() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("fixtures/core-duplicate-policy-v1/cases.json")).unwrap();
    for case in cases.iter().filter(|case| case["kind"] == "render") {
        let mut input = case["input"].clone();
        let original = input["preferredTerm"]["id"].as_str().unwrap().to_owned();
        let replacement = uuid::Uuid::new_v4().to_string();
        input["id"] = json!(uuid::Uuid::new_v4().to_string());
        input["preferredTerm"]["id"] = json!(replacement);
        for term in input["terms"].as_array_mut().unwrap() {
            if term["id"] == original {
                term["id"] = json!(replacement);
            }
        }
        input["createdAt"] = json!("current Core observation");
        input["updatedAt"] = json!("current Core observation");
        let result =
            nal_bootstrap::render_concept(&serde_json::from_value(input).unwrap()).unwrap();
        assert_eq!(result, case["output"].as_str().unwrap());
    }
    let case = cases
        .iter()
        .find(|case| {
            case["kind"] == "undo"
                && case["input"]["classification"]["nal"]["after"][0]["id"]
                    .as_str()
                    .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
        })
        .unwrap();
    let original = case["input"]["classification"]["nal"]["after"][0]["id"]
        .as_str()
        .unwrap();
    let replacement = uuid::Uuid::new_v4().to_string();
    let snapshot_json = case["input"].to_string().replace(original, &replacement);
    let mut expected: Value =
        serde_json::from_str(&case["output"].to_string().replace(original, &replacement)).unwrap();
    expected["snapshotSha256"] = json!(format!("{:x}", Sha256::digest(snapshot_json.as_bytes())));
    let actual = duplicate_undo::prepare(&UndoMergePrepareInputV1 { snapshot_json }).unwrap();
    assert_eq!(serde_json::to_value(actual).unwrap(), expected);
}
