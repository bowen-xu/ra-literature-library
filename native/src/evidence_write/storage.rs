//! Original fixed manual write statements. Core owns their execution.
pub fn static_sql() -> [&'static str; 7] {
    [
        include_str!("../../data/evidence-write-claim.v1.sql"),
        include_str!("../../data/evidence-write-revision.v1.sql"),
        include_str!("../../data/evidence-write-update.v1.sql"),
        include_str!("../../data/evidence-write-insert.v1.sql"),
        include_str!("../../data/evidence-write-history.v1.sql"),
        include_str!("../../data/evidence-write-link-upsert.v1.sql"),
        include_str!("../../data/evidence-write-link-lookup.v1.sql"),
    ]
}
