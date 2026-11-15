use super::unreviewed_fields;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    review_selection::UnreviewedSelectionInputV1,
};

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

#[test]
fn original_exclusions_preserve_pending_order_duplicates_and_raw_identity() {
    for (pending, protected, reviewed, expected) in [
        (vec![], vec!["absent"], vec!["absent"], vec![]),
        (
            vec!["乙", "甲", "乙", "", "\0", " 甲 "],
            vec![],
            vec![],
            vec!["乙", "甲", "乙", "", "\0", " 甲 "],
        ),
        (
            vec!["乙", "甲", "乙", "", "\0", " 甲 "],
            vec!["甲", "甲", "absent"],
            vec!["\0", "甲"],
            vec!["乙", "乙", "", " 甲 "],
        ),
        (vec!["甲", "甲"], vec!["甲"], vec!["甲"], vec![]),
    ] {
        let pending = strings(&pending);
        let frozen = pending.clone();
        assert_eq!(
            unreviewed_fields(&pending, &strings(&protected), &strings(&reviewed)),
            strings(&expected)
        );
        assert_eq!(pending, frozen);
    }
}

#[test]
fn dispatch_binds_the_complete_input_without_resource_id_or_revision_validation() {
    let input = UnreviewedSelectionInputV1 {
        resource_id: String::new(),
        resource_revision: i64::MIN,
        pending_field_ids: strings(&["乙", "甲", "乙"]),
        protected_field_ids: strings(&["甲"]),
        reviewed_field_ids: strings(&["absent"]),
    };
    let output = crate::catalog::dispatch(CatalogInput::SelectUnreviewedFields {
        input: Box::new(input.clone()),
    })
    .unwrap();
    assert_eq!(output.operation(), CatalogOperation::SelectUnreviewedFields);
    let CatalogOutput::UnreviewedFields { selection } = output else {
        panic!("selection")
    };
    assert_eq!(*selection.input, input);
    assert_eq!(selection.selected_field_ids, strings(&["乙", "乙"]));
}
