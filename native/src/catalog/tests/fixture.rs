use super::super::*;

pub(super) fn text(value: &str) -> DataValue {
    DataValue::Text(value.to_owned())
}

pub(super) fn rows(values: Vec<Vec<DataValue>>) -> DataRows {
    DataRows { rows: values }
}

pub(super) fn ids(values: &[&str]) -> DataRows {
    rows(values.iter().map(|id| vec![text(id)]).collect())
}

pub(super) fn item_rows(id: &str) -> CatalogItemRows {
    CatalogItemRows {
        main: rows(vec![vec![
            text(id),
            text("legacy-custom-kind"),
            text("Title"),
            text("Abstract"),
            DataValue::Integer(2026),
            text("Journal"),
            text("Conference"),
            text("Proceedings"),
            text("Place"),
            text("7"),
            text("2"),
            text("3–8"),
            text("10.example/id"),
            text("https://example.invalid"),
            text(" zh "),
            text("key"),
            DataValue::Null,
            text("legacy-status"),
            text("created"),
            text("updated"),
            DataValue::Null,
        ]]),
        related: Some(CatalogRelatedRows {
            creators: rows(vec![
                vec![text("Family"), text("Given"), text(""), text("translator")],
                vec![text(""), text(""), text("Literal Name"), text("author")],
            ]),
            tags: ids(&["b", "A"]),
            attachments: rows(vec![vec![
                text("attachment"),
                text("PDF"),
                text("application/pdf"),
                DataValue::Integer(7),
                text("hash"),
            ]]),
            project_ids: ids(&["project-z", "project-a"]),
            metadata_sources: rows(vec![
                vec![text("abstractText"), text("import"), DataValue::Integer(-1)],
                vec![text("title"), text("user"), DataValue::Integer(0)],
            ]),
        }),
    }
}

pub(super) fn projection(
    request: CatalogRequest,
    items: Vec<CatalogItemRows>,
) -> CatalogProjectionInput {
    CatalogProjectionInput { request, items }
}

pub(super) fn get_input(item: CatalogItemRows) -> CatalogProjectionInput {
    projection(CatalogRequest::Get { id: "item".into() }, vec![item])
}

pub(super) fn projected(input: &CatalogProjectionInput) -> CatalogItem {
    let CatalogProjectionOutcome::Success { mut items } = project(input).unwrap() else {
        panic!("expected projected item");
    };
    items.remove(0)
}
