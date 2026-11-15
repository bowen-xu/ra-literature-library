//! Original SQL resources consumed only by Core fixed execution.
pub fn unit_sql() -> [&'static str; 13] {
    [
        include_str!("../../data/paper-confirmation-unit-template-lookup.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-ordinary-lookup.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-template-link.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-update.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-current-revision.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-revert.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-restore.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-snapshot.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-snapshot-evidence.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-evidence-delete.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-evidence-insert.v1.sql"),
        include_str!("../../data/paper-confirmation-unit-evidence-restore.v1.sql"),
        include_str!("../../data/nal-bootstrap-research-revision-insert.v1.sql"),
    ]
}

pub fn anchor_sql() -> &'static str {
    include_str!("../../data/paper-confirmation-anchor-insert.v1.sql")
}

pub fn confirmation_sql() -> [&'static str; 20] {
    [
        include_str!("../../data/paper-confirmation-metadata-receipt-exists.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-source.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-clock.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-confirm.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-receipt-insert.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-pending-undo.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-restore.v1.sql"),
        include_str!("../../data/paper-confirmation-metadata-undo-insert.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-batch.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-batch-metadata.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-batch-overviews.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-batch-for-key.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-exists.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-batch-insert.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-undo-for-key.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-remaining-metadata.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-undo-insert.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-overview-link.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-candidate-ids.v1.sql"),
        include_str!("../../data/paper-confirmation-paper-remaining-overviews.v1.sql"),
    ]
}
