//! Fixed original manual storage statements, consumed only by Core.
pub fn static_sql() -> [&'static str; 7] {
    [
        include_str!("../../data/derived-view-ids.v1.sql"),
        include_str!("../../data/derived-view-insert.v1.sql"),
        include_str!("../../data/derived-view-header.v1.sql"),
        include_str!("../../data/derived-view-update.v1.sql"),
        include_str!("../../data/derived-view-revision.v1.sql"),
        include_str!("../../data/derived-view-view.v1.sql"),
        include_str!("../../data/derived-view-input-snapshot.v1.sql"),
    ]
}
