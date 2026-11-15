use super::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    derived_view::manual::*,
};
#[test]
fn manual_provenance_preserves_original_transition_and_rejects_wrong_response_family() {
    for current in ["human_original", "ai_suggestion", "ai_accepted_after_edit"] {
        for review in ["unreviewed", "accepted", "rejected", "deferred"] {
            let input = DerivedViewInputV1::Provenance {
                current: current.into(),
                review: review.into(),
            };
            let expected = if current == "ai_suggestion" && review == "accepted" {
                "ai_accepted_after_edit"
            } else {
                current
            };
            let wire = CatalogInput::DecideDerivedView {
                input: Box::new(input.clone()),
            };
            let bytes = serde_json::to_vec(&wire).unwrap();
            let output = crate::catalog::dispatch(serde_json::from_slice(&bytes).unwrap()).unwrap();
            assert_eq!(output.operation(), CatalogOperation::DecideDerivedView);
            let CatalogOutput::DerivedViewDecision { decision } = output else {
                panic!("decision family");
            };
            assert_eq!(
                decision,
                DerivedViewDecisionV1::Provenance {
                    value: expected.into()
                }
            );
            assert!(input.matches_decision(&decision));
            assert!(!input.matches_decision(&DerivedViewDecisionV1::Provenance {
                value: "human_original-injected".into()
            }));
            assert!(!input.matches_decision(&DerivedViewDecisionV1::Validated { rejection: None }));
        }
    }
}
#[test]
fn manual_validation_uses_the_same_original_rules_and_bounded_rejection() {
    let input = DerivedValidationInputV1::Item {
        ordinal: 0,
        view_kind: "gap_hypothesis".into(),
        item: DerivedViewItem {
            id: "item".into(),
            text: "Synthetic comparison Ω".into(),
            epistemic_role: "synthesis".into(),
            evidence_anchor_ids: vec!["a".into()],
            has_conflict: true,
        },
        allowed_anchors: vec!["a".into()],
    };
    assert!(validate(&input).is_err());
    let request = DerivedViewInputV1::Validate {
        input: Box::new(input),
    };
    let decision = manual::decide(&request);
    assert_eq!(
        decision,
        DerivedViewDecisionV1::Validated {
            rejection: Some(DerivedRejectionV1::Item)
        }
    );
    assert!(request.matches_decision(&decision));
    assert!(
        !request.matches_decision(&DerivedViewDecisionV1::Validated {
            rejection: Some(DerivedRejectionV1::Header)
        })
    );
    let mut wire = serde_json::to_value(request).unwrap();
    wire["sql"] = serde_json::json!("private instruction");
    assert!(serde_json::from_value::<DerivedViewInputV1>(wire).is_err());
}
