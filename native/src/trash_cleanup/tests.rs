use super::*;
use sha2::{Digest, Sha256};

#[test]
fn original_static_plan_has_the_reviewed_canonical_digest_and_all_ordered_roles() {
    let TrashCleanupPreparationV1::Ready { plan } = prepare() else {
        panic!("original finite graph is acyclic")
    };
    assert_eq!(plan.soft_owners.len(), 4);
    assert_eq!(plan.relations.len(), 110);
    assert_eq!(plan.delete_tables.len(), 81);
    assert_eq!(
        format!("{:x}", Sha256::digest(serde_json::to_vec(&plan).unwrap())),
        "fb0d5090e40cecd2d317d7a13a1e9216ddc27c4303089a38f49748576612bbf4"
    );
    assert_eq!(
        plan.relations
            .iter()
            .map(|edge| &edge.id)
            .collect::<BTreeSet<_>>()
            .len(),
        110
    );
    let order = deletion_order().unwrap();
    assert_eq!(order.len(), 82);
    assert_eq!(order[79], "bibliographic_items");
    assert_eq!(
        &order[80..],
        &[
            "paper_reading_profile_selection_revisions",
            "ai_overview_profile_runs"
        ]
    );
    assert_eq!(
        plan.delete_tables,
        order
            .into_iter()
            .filter(|table| *table != "bibliographic_items")
            .collect::<Vec<_>>()
    );
}

#[test]
fn borrowed_metadata_preserves_composite_columns_and_child_before_parent_order() {
    let edges = relations().collect::<Vec<_>>();
    assert_eq!(edges.len(), 110);
    assert_eq!(
        edges.iter().filter(|edge| edge.columns.len() == 2).count(),
        4
    );
    let composite = edges
        .iter()
        .find(|edge| edge.child == "ai_matrix_synthesis_input_cells")
        .unwrap();
    assert_eq!(
        composite.columns,
        &[("cell_id", "cell_id"), ("cell_revision", "revision")]
    );
    let order = deletion_order().unwrap();
    for edge in edges {
        let child = order.iter().position(|table| *table == edge.child).unwrap();
        let parent = order
            .iter()
            .position(|table| *table == edge.parent)
            .unwrap();
        assert!(
            child < parent,
            "{} must precede {}",
            edge.child,
            edge.parent
        );
    }
}

#[test]
fn independent_resources_are_not_added_to_the_owned_deletion_plan() {
    let TrashCleanupPreparationV1::Ready { plan } = prepare() else {
        unreachable!()
    };
    for table in [
        "note_pages",
        "accepted_concepts",
        "definition_claims",
        "agent_conversations",
        "paper_concept_candidates",
        "content_objects",
        "writing_projects",
    ] {
        assert!(!plan.delete_tables.iter().any(|owned| owned == table));
        assert!(!plan.relations.iter().any(|edge| edge.child == table));
    }
    assert_eq!(
        CleanupPlanError::Cycle.to_string(),
        "LITERATURE_CLEANUP_PLAN_CYCLE"
    );
}
