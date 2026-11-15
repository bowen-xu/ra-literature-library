use super::*;
use serde::Deserialize;

fn paper(id: &str) -> Term {
    Term::Paper { id: id.into() }
}

fn concept(id: &str) -> Term {
    Term::Concept { id: id.into() }
}

fn statement(id: &str, subject: Term, predicate: Term) -> NalStatement {
    NalStatement {
        id: id.into(),
        subject,
        predicate,
        origin: " raw\0origin ".into(),
    }
}

fn annotation(id: &str, target_kind: &str, target_id: &str) -> NalAnnotation {
    NalAnnotation {
        id: id.into(),
        target_kind: target_kind.into(),
        target_id: target_id.into(),
        note_page_id: "core-note".into(),
    }
}

#[test]
fn scope_keeps_original_recursive_paper_selection_annotation_order_and_duplicates() {
    let direct = statement("direct", concept("other"), paper("source"));
    let nested = statement(
        "nested",
        Term::Product {
            terms: vec![
                concept("source"),
                Term::Product {
                    terms: vec![paper("source")],
                },
            ],
        },
        concept("relation"),
    );
    let unrelated = statement("unrelated", concept("source"), paper("source\0tail"));
    let first_note = annotation("first", "statement", "direct");
    let next_note = annotation("next", "statement", "nested");
    let (selected, notes) = scope(
        vec![nested.clone(), unrelated, direct.clone(), nested.clone()],
        vec![
            annotation("concept-note", "concept", "nested"),
            first_note.clone(),
            annotation("wrong-case", "Statement", "direct"),
            next_note.clone(),
            annotation("outside", "statement", "unrelated"),
            first_note.clone(),
        ],
        "source",
    );
    assert_eq!(selected, [nested.clone(), direct, nested]);
    assert_eq!(notes, [first_note.clone(), next_note, first_note]);
}

#[derive(Deserialize)]
struct OriginalTermCase {
    name: String,
    raw: String,
    from: String,
    to: String,
    expected: String,
    references: bool,
}

#[test]
fn public_scope_and_complete_replacement_match_original_helper_golden_cases() {
    // Golden results were captured from the original references/replace bodies,
    // including raw escaped JSON, C0/NUL strings and a depth-24 product.
    let cases: Vec<OriginalTermCase> =
        serde_json::from_str(include_str!("original-term-cases.json")).unwrap();
    for case in cases {
        let term: Term = serde_json::from_str(&case.raw).unwrap();
        let source = statement("source-id", term, concept(&case.from));
        let expected = NalStatement {
            id: " raw\0reserved-id ".into(),
            subject: serde_json::from_str(&case.expected).unwrap(),
            predicate: concept(&case.from),
            origin: source.origin.clone(),
        };
        let selected = scope(vec![source.clone()], vec![], &case.from).0;
        assert_eq!(!selected.is_empty(), case.references, "{}", case.name);
        let next = replace_statement(source, &case.from, &case.to, expected.id.clone());
        assert_eq!(next, expected, "{}", case.name);
        assert_eq!(serde_json::to_string(&next.subject).unwrap(), case.expected);
        assert_eq!(
            serde_json::to_string(&next).unwrap(),
            serde_json::to_string(&expected).unwrap()
        );
    }
}

#[test]
fn undo_delta_uses_whole_entry_contains_and_preserves_after_order_and_duplicates() {
    let old = statement("same-id", paper("survivor"), concept("old"));
    let changed = NalStatement {
        origin: "changed".into(),
        ..old.clone()
    };
    let new = statement("new", paper("survivor"), concept("new"));
    let old_note = annotation("old-note", "statement", "same-id");
    let new_note = annotation("new-note", "statement", "new");
    let snapshot = MergeNalSnapshot {
        before: vec![old.clone(), old.clone()],
        after: vec![new.clone(), old, changed.clone(), new, changed],
        before_annotations: vec![old_note.clone(), old_note.clone()],
        after_annotations: vec![new_note.clone(), old_note, new_note],
    };
    assert_eq!(
        nal_undo_delta(&snapshot.after, &snapshot.after_annotations, &snapshot),
        Some(NalUndoDelta {
            statement_ids: vec![
                "new".into(),
                "same-id".into(),
                "new".into(),
                "same-id".into()
            ],
            annotation_ids: vec!["new-note".into(), "new-note".into()],
        })
    );
}

#[test]
fn undo_checks_every_statement_field_and_vector_order_and_multiplicity() {
    let a = statement("a", paper("survivor"), concept("relation"));
    let b = statement("b", paper("survivor"), concept("other"));
    let snapshot = MergeNalSnapshot {
        before: vec![],
        after: vec![a.clone(), b.clone()],
        before_annotations: vec![],
        after_annotations: vec![],
    };
    for current in [
        vec![
            NalStatement {
                id: "changed".into(),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![
            NalStatement {
                subject: concept("survivor"),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![
            NalStatement {
                predicate: paper("relation"),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![
            NalStatement {
                origin: "changed".into(),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![b.clone(), a.clone()],
        vec![a.clone()],
        vec![a.clone(), b.clone(), b],
    ] {
        assert!(nal_undo_delta(&current, &[], &snapshot).is_none());
    }
}

#[test]
fn undo_checks_every_annotation_field_and_vector_order_and_multiplicity() {
    let a = annotation("a", "statement", "target");
    let b = annotation("b", "statement", "other");
    let snapshot = MergeNalSnapshot {
        before: vec![],
        after: vec![],
        before_annotations: vec![],
        after_annotations: vec![a.clone(), b.clone()],
    };
    for current in [
        vec![
            NalAnnotation {
                id: "changed".into(),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![
            NalAnnotation {
                target_kind: "concept".into(),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![
            NalAnnotation {
                target_id: "changed".into(),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![
            NalAnnotation {
                note_page_id: "changed".into(),
                ..a.clone()
            },
            b.clone(),
        ],
        vec![b.clone(), a.clone()],
        vec![a.clone()],
        vec![a.clone(), b.clone(), b],
    ] {
        assert!(nal_undo_delta(&[], &current, &snapshot).is_none());
    }
}

#[test]
fn unchanged_or_empty_vectors_return_an_empty_delta_without_io() {
    let a = statement("a", paper("survivor"), concept("relation"));
    let note = annotation("note", "statement", "a");
    for snapshot in [
        MergeNalSnapshot {
            before: vec![],
            after: vec![],
            before_annotations: vec![],
            after_annotations: vec![],
        },
        MergeNalSnapshot {
            before: vec![a.clone()],
            after: vec![a],
            before_annotations: vec![note.clone()],
            after_annotations: vec![note],
        },
    ] {
        assert_eq!(
            nal_undo_delta(&snapshot.after, &snapshot.after_annotations, &snapshot),
            Some(NalUndoDelta {
                statement_ids: vec![],
                annotation_ids: vec![]
            })
        );
    }
}
