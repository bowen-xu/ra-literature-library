//! Pure preparation; Core retains actual reads, equality checks and undo writes.
use crate::duplicate_merge::nal_undo_delta;
use research_workbench_native_sdk::{
    duplicate_merge::{DuplicateMergeSnapshot, MergeClassificationSnapshot, MergeNalSnapshot},
    duplicate_undo::{
        PreparedClassificationUndoV1, PreparedDuplicateUndoV1, PreparedNalUndoV1,
        UndoMergePrepareInputV1,
    },
};
use sha2::{Digest, Sha256};

/// Decode with the unchanged historical codec and bind to the exact raw bytes.
/// This prepares comparisons/deltas, never checks the current database state.
pub fn prepare(
    input: &UndoMergePrepareInputV1,
) -> Result<PreparedDuplicateUndoV1, serde_json::Error> {
    let snapshot: DuplicateMergeSnapshot = serde_json::from_str(&input.snapshot_json)?;
    Ok(PreparedDuplicateUndoV1 {
        snapshot_sha256: format!("{:x}", Sha256::digest(input.snapshot_json.as_bytes())),
        classification: snapshot
            .classification
            .map(prepare_classification)
            .transpose()?,
    })
}

fn prepare_classification(
    snapshot: MergeClassificationSnapshot,
) -> Result<PreparedClassificationUndoV1, serde_json::Error> {
    Ok(PreparedClassificationUndoV1 {
        expected_memberships_json: serde_json::to_string(&snapshot.after_memberships)?,
        expected_assignments_json: serde_json::to_string(&snapshot.after_assignments)?,
        delete_assignments: snapshot
            .after_assignments
            .iter()
            .filter(|a| !snapshot.before_assignments.contains(a))
            .cloned()
            .collect(),
        delete_memberships: snapshot
            .after_memberships
            .iter()
            .filter(|m| !snapshot.before_memberships.contains(m))
            .cloned()
            .collect(),
        nal: snapshot.nal.map(prepare_nal).transpose()?,
    })
}

fn prepare_nal(snapshot: MergeNalSnapshot) -> Result<PreparedNalUndoV1, serde_json::Error> {
    // Both current arguments are the snapshot's own immutable after vectors,
    // so the canonical equality check is statically guaranteed to succeed.
    let delta = nal_undo_delta(&snapshot.after, &snapshot.after_annotations, &snapshot)
        .expect("snapshot after vectors equal themselves");
    Ok(PreparedNalUndoV1 {
        expected_statements_json: serde_json::to_string(&snapshot.after)?,
        expected_annotations_json: serde_json::to_string(&snapshot.after_annotations)?,
        delete_statement_ids: delta.statement_ids,
        delete_annotation_ids: delta.annotation_ids,
    })
}

#[cfg(test)]
mod tests;
