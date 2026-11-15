//! Canonical original evidence read SQL for static and independent composition.
pub fn static_sql() -> [&'static str; 4] {
    [
        include_str!("../data/evidence-read-claims.v1.sql"),
        include_str!("../data/evidence-read-source.v1.sql"),
        include_str!("../data/evidence-read-sources.v1.sql"),
        include_str!("../data/evidence-read-links.v1.sql"),
    ]
}
