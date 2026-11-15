use super::*;

fn draft() -> StructuredReadingUnitDraft {
    StructuredReadingUnitDraft {
        id: None,
        project_id: None,
        paper_id: None,
        unit_kind: "other".into(),
        title: "  Title  ".into(),
        body: "  Body  ".into(),
        epistemic_role: "working_note".into(),
        anchor_id: None,
        evidence_stance: None,
        evidence_rationale: None,
        expected_revision: None,
        change_reason: None,
    }
}
#[test]
fn ordered_rejections_match_original_even_without_an_anchor() {
    let mut d = draft();
    d.body = " ".into();
    d.title = "x".repeat(241);
    d.unit_kind = "bad".into();
    d.epistemic_role = "bad".into();
    d.evidence_stance = Some("bad".into());
    assert_eq!(validate_and_normalize(&mut d), Err(Reject::EmptyBody));
    d.body = "x".into();
    assert_eq!(validate_and_normalize(&mut d), Err(Reject::TitleTooLong));
    d.title = "".into();
    assert_eq!(validate_and_normalize(&mut d), Err(Reject::UnitKind));
    d.unit_kind = "other".into();
    assert_eq!(validate_and_normalize(&mut d), Err(Reject::EpistemicRole));
    d.epistemic_role = "working_note".into();
    assert_eq!(validate_and_normalize(&mut d), Err(Reject::EvidenceStance));
}
#[test]
fn scalar_count_and_whitespace_are_original_and_new_expected_is_deferred() {
    let mut d = draft();
    d.title = format!("  {}  ", "🧪".repeat(240));
    d.expected_revision = Some(-1);
    d.project_id = Some(" ".into());
    d.evidence_rationale = Some("  reason  ".into());
    d.change_reason = Some(" ".into());
    let input = ReadingUnitRequestV1::Save {
        draft: Box::new(d.clone()),
    };
    let ReadingUnitPreparationV1::Ready { plan } = prepare(input.clone()) else {
        panic!("new expectedRevision must wait for BEGIN")
    };
    let ReadingUnitPlanV1::Save {
        draft: original,
        title,
        body,
        evidence_stance,
        evidence_rationale,
        rules,
    } = *plan
    else {
        panic!("save")
    };
    assert_eq!(*original, d);
    assert_eq!(title, "🧪".repeat(240));
    assert_eq!(body, "Body");
    assert_eq!(evidence_stance, "context");
    assert_eq!(evidence_rationale, "reason");
    assert_eq!(rules.change_reason, " ");
    assert_eq!(
        rules.new_expected_rejection,
        Some(Reject::NewExpectedRevision)
    );
    let output = crate::catalog::dispatch(
        research_workbench_native_sdk::catalog::CatalogInput::PrepareReadingUnit {
            input: Box::new(input),
        },
    );
    assert!(output.is_ok());
}
#[test]
fn list_keeps_optional_and_empty_filter_identity_without_validation() {
    let input = ReadingUnitRequestV1::List {
        project_id: Some("".into()),
        paper_id: Some(" ".into()),
    };
    let ReadingUnitPreparationV1::Ready { plan } = prepare(input) else {
        panic!("list")
    };
    assert_eq!(
        *plan,
        ReadingUnitPlanV1::List {
            project_id: Some("".into()),
            paper_id: Some(" ".into())
        }
    );
}
