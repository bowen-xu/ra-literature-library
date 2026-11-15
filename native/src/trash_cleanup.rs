//! Canonical finite permanent-cleanup graph and original deletion ordering.
//! Row capture, SQL preparation/execution and settlement remain in Core.
pub use research_workbench_native_sdk::trash_cleanup::{
    CleanupPlanRejectionCodeV1, CleanupPlanV1, CleanupRelationV1, TrashCleanupPreparationV1,
};
use std::collections::BTreeSet;
mod graph;

/// Transitional same-plugin adapters reuse this metadata without copying policy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Relation {
    pub child: &'static str,
    pub parent: &'static str,
    pub columns: &'static [(&'static str, &'static str)],
}

pub const SOFT_PAPER_OWNERS: &[&str] = &[
    "paper_reading_profile_selection_revisions",
    "ai_overview_profile_runs",
    "ai_evidence_items",
    "paper_ai_reading_turn_context_items",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum CleanupPlanError {
    #[error("LITERATURE_CLEANUP_PLAN_CYCLE")]
    Cycle,
}

pub fn relations() -> impl Iterator<Item = &'static Relation> {
    graph::edges()
}

pub fn deletion_order() -> Result<Vec<&'static str>, CleanupPlanError> {
    fn visit(
        table: &'static str,
        active: &mut BTreeSet<&'static str>,
        done: &mut BTreeSet<&'static str>,
        order: &mut Vec<&'static str>,
    ) -> Result<(), CleanupPlanError> {
        if done.contains(table) {
            return Ok(());
        }
        if !active.insert(table) {
            return Err(CleanupPlanError::Cycle);
        }
        for edge in relations().filter(|edge| edge.parent == table) {
            visit(edge.child, active, done, order)?;
        }
        active.remove(table);
        done.insert(table);
        order.push(table);
        Ok(())
    }
    let mut order = Vec::new();
    let mut active = BTreeSet::new();
    let mut done = BTreeSet::new();
    visit("bibliographic_items", &mut active, &mut done, &mut order)?;
    for table in SOFT_PAPER_OWNERS {
        visit(table, &mut active, &mut done, &mut order)?;
    }
    Ok(order)
}

pub fn prepare() -> TrashCleanupPreparationV1 {
    let order = match deletion_order() {
        Ok(order) => order,
        Err(CleanupPlanError::Cycle) => {
            return TrashCleanupPreparationV1::Rejected {
                code: CleanupPlanRejectionCodeV1::PlanCycle,
            };
        }
    };
    TrashCleanupPreparationV1::Ready {
        plan: CleanupPlanV1 {
            soft_owners: SOFT_PAPER_OWNERS
                .iter()
                .map(|table| (*table).into())
                .collect(),
            relations: relations()
                .map(|edge| CleanupRelationV1 {
                    id: format!(
                        "literature.trash-cleanup.collect-{}-{}--{}",
                        edge.child,
                        edge.columns
                            .iter()
                            .map(|(child, _)| *child)
                            .collect::<Vec<_>>()
                            .join("-"),
                        edge.parent
                    ),
                    child: edge.child.into(),
                    parent: edge.parent.into(),
                })
                .collect(),
            delete_tables: order
                .into_iter()
                .filter(|table| *table != "bibliographic_items")
                .map(String::from)
                .collect(),
        },
    }
}

#[cfg(test)]
mod tests;
