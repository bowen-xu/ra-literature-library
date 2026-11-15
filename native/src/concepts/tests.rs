use super::*;
use research_workbench_native_sdk::catalog::{CatalogInput, CatalogOutput};
use serde_json::json;
fn draft() -> ConceptDraft {
    serde_json::from_value(json!({"preferredTerm":" A\nＢ ","language":" zh ","label":" 原名`语境 ","explanation":"","disambiguation":" d ","domain":" x ","tradition":" y ","period":" z "})).unwrap()
}
#[test]
fn search_normalization_keeps_original_wildcards_unicode_and_nul() {
    assert_eq!(
        prepare_search(" A\nＢ_%\0 "),
        ("a ｂ_%\0".into(), "%a ｂ_%\0%".into())
    );
    assert_eq!(prepare_search(" \n\u{3000}"), ("".into(), "%%".into()));
}
#[test]
fn validation_preserves_raw_field_length_and_name_error_priority() {
    let mut d = details(&draft());
    d.label = " ` ".into();
    d.domain = "x".repeat(501);
    assert_eq!(validate_details(&d), Err(Reject::EmptyNameContext));
    d.label = " ".repeat(501) + "x";
    assert_eq!(validate_details(&d), Err(Reject::FieldsTooLong));
    d.label = "x".repeat(501);
    assert_eq!(validate_details(&d), Err(Reject::InvalidNameLength));
    d.label = "x".into();
    d.domain.clear();
    d.explanation = "x".repeat(20_000);
    assert!(validate_details(&d).is_ok());
}
#[test]
fn term_validation_is_deferred_and_preserves_trim_and_scalar_budgets() {
    let mut d = draft();
    d.preferred_term = "  ".into();
    d.expected_revision = Some(-1);
    let original = d.clone();
    let ConceptPreparationV1::Ready { plan } =
        prepare(ConceptRequestV1::Save { draft: Box::new(d) })
    else {
        panic!("term/new expected must be deferred")
    };
    let ConceptPlanV1::Save {
        draft, term, rules, ..
    } = *plan
    else {
        panic!("save")
    };
    assert_eq!(*draft, original);
    assert_eq!(term.rejection, Some(Reject::EmptyTerm));
    assert_eq!(
        rules.new_expected_rejection,
        Some(Reject::NewExpectedRevision)
    );
    assert_eq!(
        prepare_term(&"字".repeat(500), &"中".repeat(32)).rejection,
        None
    );
    assert_eq!(
        prepare_term(&"字".repeat(501), "").rejection,
        Some(Reject::TermTooLong)
    );
}
#[test]
fn save_plan_echoes_every_input_and_keeps_reason_empty_vs_none() {
    for reason in [None, Some("".into()), Some(" unchanged ".into())] {
        let mut d = draft();
        d.change_reason = reason.clone();
        d.id = Some("original".into());
        d.expected_revision = Some(i64::MAX);
        let ConceptPreparationV1::Ready { plan } = prepare(ConceptRequestV1::Save {
            draft: Box::new(d.clone()),
        }) else {
            panic!("ready")
        };
        let ConceptPlanV1::Save {
            draft,
            details,
            term,
            rules,
        } = *plan
        else {
            panic!("save")
        };
        assert_eq!(*draft, d);
        assert_eq!(details.label, "原名`语境");
        assert_eq!(details.explanation, "");
        assert_eq!(term.normalized_text, "a ｂ");
        assert_eq!(rules.concept_reason, reason.unwrap_or("manual_edit".into()));
        assert_eq!(rules.initial_revision, 1);
        assert_eq!(rules.new_expected_rejection, None);
    }
}
#[test]
fn invalid_details_are_rejected_with_full_original_echo() {
    let mut d = draft();
    d.label.clear();
    d.preferred_term.clear();
    assert_eq!(
        prepare(ConceptRequestV1::Save {
            draft: Box::new(d.clone())
        }),
        ConceptPreparationV1::Rejected {
            input: Box::new(ConceptRequestV1::Save { draft: Box::new(d) }),
            reason: Reject::InvalidNameLength
        }
    );
}
#[test]
fn production_catalog_dispatch_uses_the_same_preparation() {
    let input = ConceptRequestV1::Save {
        draft: Box::new(draft()),
    };
    assert_eq!(
        crate::catalog::dispatch(CatalogInput::PrepareResearchConcept {
            input: Box::new(input.clone())
        })
        .unwrap(),
        CatalogOutput::ResearchConceptPreparation {
            outcome: Box::new(prepare(input))
        }
    );
}
