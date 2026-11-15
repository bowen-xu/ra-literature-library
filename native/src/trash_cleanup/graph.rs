use super::Relation;

// Explicit library lifecycle edges. This list is not inferred from arbitrary
// runtime foreign keys. New dependencies must choose an ownership rule here.
macro_rules! edge {
    ($child:literal,$column:literal,$parent:literal,$key:literal) => {
        Relation {
            child: $child,
            parent: $parent,
            columns: &[($column, $key)],
        }
    };
    ($child:literal,$column:literal,$parent:literal,$key:literal;$column2:literal,$key2:literal) => {
        Relation {
            child: $child,
            parent: $parent,
            columns: &[($column, $key), ($column2, $key2)],
        }
    };
}

#[path = "graph/dependents.rs"]
mod dependents;
#[path = "graph/paper.rs"]
mod paper;

pub(super) fn edges() -> impl Iterator<Item = &'static Relation> {
    paper::EDGES.iter().chain(dependents::EDGES)
}
