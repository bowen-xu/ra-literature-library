//! Original NAL duplicate-merge rules; callers retain all reads and writes.
use research_workbench_native_sdk::{
    duplicate_merge::MergeNalSnapshot,
    nal_annotation::NalAnnotation,
    nal_state::{NalStatement, NalTerm as Term},
};

fn references(term: &Term, paper: &str) -> bool {
    match term {
        Term::Paper { id } => id == paper,
        Term::Product { terms } => terms.iter().any(|t| references(t, paper)),
        _ => false,
    }
}
fn replace(term: &Term, from: &str, to: &str) -> Term {
    match term {
        Term::Paper { id } if id == from => Term::Paper { id: to.into() },
        Term::Product { terms } => Term::Product {
            terms: terms.iter().map(|t| replace(t, from, to)).collect(),
        },
        _ => term.clone(),
    }
}

/// Filter an already decoded state in its original order, including duplicates.
/// Concept identities are not paper references, even when their strings match.
pub fn scope(
    statements: Vec<NalStatement>,
    annotations: Vec<NalAnnotation>,
    paper: &str,
) -> (Vec<NalStatement>, Vec<NalAnnotation>) {
    let statements: Vec<_> = statements
        .into_iter()
        .filter(|s| references(&s.subject, paper) || references(&s.predicate, paper))
        .collect();
    let annotations = annotations
        .into_iter()
        .filter(|a| a.target_kind == "statement" && statements.iter().any(|s| s.id == a.target_id))
        .collect();
    (statements, annotations)
}

/// Retain the original origin and recursive replacement, using the caller's ID.
/// This neither allocates an identity nor inserts or predicts a stored fact.
pub fn replace_statement(source: NalStatement, from: &str, to: &str, id: String) -> NalStatement {
    NalStatement {
        id,
        subject: replace(&source.subject, from, to),
        predicate: replace(&source.predicate, from, to),
        origin: source.origin,
    }
}

/// IDs from the original after-minus-before contains/filter sequence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NalUndoDelta {
    pub statement_ids: Vec<String>,
    pub annotation_ids: Vec<String>,
}

/// Refuse any whole-vector change before returning the original ordered delta.
/// Full entries, order and multiplicity take part in the equality check. The
/// difference uses contains, so duplicates in after remain repeated deletions.
pub fn nal_undo_delta(
    current: &[NalStatement],
    annotations: &[NalAnnotation],
    snapshot: &MergeNalSnapshot,
) -> Option<NalUndoDelta> {
    if current != snapshot.after || annotations != snapshot.after_annotations {
        return None;
    }
    Some(NalUndoDelta {
        statement_ids: snapshot
            .after
            .iter()
            .filter(|s| !snapshot.before.contains(s))
            .map(|s| s.id.clone())
            .collect(),
        annotation_ids: snapshot
            .after_annotations
            .iter()
            .filter(|a| !snapshot.before_annotations.contains(a))
            .map(|a| a.id.clone())
            .collect(),
    })
}

#[cfg(test)]
mod tests;
