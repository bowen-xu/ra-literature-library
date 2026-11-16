use research_literature_library_native::catalog::dispatch;
use research_workbench_native_sdk::catalog::{CatalogInput, CatalogOutput};

#[test]
fn finite_core_context_inputs_match_the_public_domain_policy() {
    let cases: Vec<(CatalogInput, CatalogOutput)> =
        serde_json::from_str(include_str!("fixtures/core-context-policy-v1/cases.json")).unwrap();
    assert!(!cases.is_empty());
    for (input, expected) in cases {
        let actual = dispatch(input).expect("public finite context input");
        assert_eq!(actual, expected);
    }
}
