use super::*;
use research_workbench_native_sdk::catalog::{CatalogInput, CatalogOperation, CatalogOutput};
#[test]
fn original_claim_and_stance_rules_keep_error_order_and_all_original_values() {
    for role in [
        "assertion",
        "source_paraphrase",
        "synthesis",
        "inference",
        "hypothesis",
        "question",
        "working_note",
    ] {
        assert!(
            decide(&EvidenceWriteInputV1::Claim {
                statement: "Manual Ω".into(),
                epistemic_role: role.into()
            })
            .rejection
            .is_none()
        );
    }
    let empty = EvidenceWriteInputV1::Claim {
        statement: String::new(),
        epistemic_role: "unsupported".into(),
    };
    assert_eq!(
        decide(&empty).rejection,
        Some(EvidenceWriteRejectionV1::EmptyStatement)
    );
    let invalid = EvidenceWriteInputV1::Claim {
        statement: "Manual Ω".into(),
        epistemic_role: "unsupported".into(),
    };
    assert_eq!(
        decide(&invalid).rejection,
        Some(EvidenceWriteRejectionV1::InvalidEpistemicRole(
            "unsupported".into()
        ))
    );
    for stance in ["supports", "opposes", "context"] {
        assert!(
            decide(&EvidenceWriteInputV1::Stance {
                stance: stance.into()
            })
            .rejection
            .is_none()
        );
    }
    let input = EvidenceWriteInputV1::Stance {
        stance: "other".into(),
    };
    let decision = decide(&input);
    assert!(input.matches_decision(&decision));
    assert_eq!(
        decision.rejection,
        Some(EvidenceWriteRejectionV1::InvalidStance("other".into()))
    );
    assert!(!invalid.matches_decision(&decision));
    assert!(!input.matches_decision(&EvidenceWriteDecisionV1 {
        rejection: Some(EvidenceWriteRejectionV1::InvalidStance("unbound".into()))
    }));
}
#[test]
fn finite_catalog_wire_keeps_bound_refusal_and_rejects_extra_authority() {
    let input = CatalogInput::ValidateEvidenceWrite {
        input: Box::new(EvidenceWriteInputV1::Stance {
            stance: "other".into(),
        }),
    };
    let bytes = serde_json::to_vec(&input).unwrap();
    let output = crate::catalog::dispatch(serde_json::from_slice(&bytes).unwrap()).unwrap();
    assert_eq!(output.operation(), CatalogOperation::ValidateEvidenceWrite);
    let CatalogOutput::EvidenceWriteDecision { decision } = output else {
        panic!("wrong result family")
    };
    assert_eq!(
        decision.rejection.unwrap().message(),
        "不支持的证据关系：other"
    );
    let mut value = serde_json::to_value(input).unwrap();
    value["input"]["sql"] = serde_json::json!("private instruction");
    assert!(serde_json::from_value::<CatalogInput>(value).is_err());
}
#[test]
fn original_draft_defaults_nullable_fields_and_legacy_unknown_tolerance_remain() {
    let claim: ClaimDraft =
        serde_json::from_value(serde_json::json!({"statement":" Untrimmed Ω ","legacyField":true}))
            .unwrap();
    assert_eq!(claim.statement, " Untrimmed Ω ");
    assert_eq!(claim.epistemic_role, "assertion");
    assert!(
        claim.id.is_none()
            && claim.project_id.is_none()
            && claim.expected_revision.is_none()
            && claim.change_reason.is_none()
    );
    let link: EvidenceLinkDraft = serde_json::from_value(
        serde_json::json!({"claimId":"c","anchorId":"a","stance":"context"}),
    )
    .unwrap();
    assert!(link.rationale.is_empty());
    let value = serde_json::to_value(&claim).unwrap();
    assert!(value["id"].is_null());
    assert_eq!(value["epistemicRole"], "assertion");
}
