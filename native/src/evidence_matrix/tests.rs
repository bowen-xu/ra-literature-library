use super::*;
use research_workbench_native_sdk::catalog::{CatalogInput, CatalogOperation, CatalogOutput};
use serde_json::json;

fn cell(state: &str) -> EvidenceMatrixCellDraft {
    serde_json::from_value(json!({"matrixId":"m","paperId":"a","dimensionId":"d","coverageState":state,"changeReason":"review"})).unwrap()
}
fn matrix() -> EvidenceMatrix {
    serde_json::from_value(json!({"id":"m","projectId":"p","title":"Compare","paperIds":["a","b"],"dimensions":[{"id":"d","label":"Claim"}],"revision":1,"createdAt":"before","updatedAt":"before"})).unwrap()
}
#[test]
fn three_coverage_states_keep_absence_separate_from_supported_statements() {
    let statement = EvidenceMatrixStatement {
        id: "s".into(),
        text: "Observed result".into(),
        epistemic_role: "source_paraphrase".into(),
        evidence_anchor_ids: vec!["anchor".into()],
    };
    for state in ["unreviewed", "not_found", "populated"] {
        for populated in [false, true] {
            let mut draft = cell(state);
            if populated {
                draft.statements.push(statement.clone());
            }
            let input = MatrixValidationInputV1::Cell {
                draft,
                matrix: matrix(),
            };
            let decision = decide(&input);
            assert_eq!(
                decision.rejection.is_none(),
                (state == "populated") == populated
            );
            assert!(input.matches_decision(&decision));
        }
    }
    let input = MatrixValidationInputV1::Statement {
        statement,
        prior_statement_ids: vec!["s".into()],
    };
    assert_eq!(decide(&input).rejection, Some(MatrixRejectionV1::Statement));
    assert!(!input.matches_decision(&MatrixValidationDecisionV1 {
        rejection: Some(MatrixRejectionV1::Matrix)
    }));
}
#[test]
fn protocol_roundtrip_keeps_original_draft_and_distinct_validation_stage() {
    let draft:EvidenceMatrixDraft=serde_json::from_value(json!({"projectId":"p","title":" Compare Ω ","paperIds":["b","a"],"dimensions":[{"id":"d","label":"Claim"}],"changeReason":" manual "})).unwrap();
    let input = CatalogInput::ValidateEvidenceMatrix {
        input: Box::new(MatrixValidationInputV1::Matrix { draft }),
    };
    let bytes = serde_json::to_vec(&input).unwrap();
    let decoded: CatalogInput = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(decoded, input);
    let output = crate::catalog::dispatch(decoded).unwrap();
    assert_eq!(output.operation(), CatalogOperation::ValidateEvidenceMatrix);
    assert!(matches!(
        output,
        CatalogOutput::EvidenceMatrixValidation {
            decision: MatrixValidationDecisionV1 { rejection: None }
        }
    ));
}
