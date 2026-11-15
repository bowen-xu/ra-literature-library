use std::collections::BTreeMap;

use scraper::{Html, Selector};

use super::model::{DoiMetadataDraft, TypeEvidence};

pub(super) fn embedded_metadata(html: &str) -> BTreeMap<String, String> {
    let document = Html::parse_document(html);
    let meta = Selector::parse("meta").expect("valid metadata selector");
    let mut output = BTreeMap::new();
    for element in document.select(&meta) {
        if let (Some(name), Some(content)) = (
            element
                .value()
                .attr("name")
                .or_else(|| element.value().attr("property")),
            element.value().attr("content"),
        ) {
            output
                .entry(name.to_ascii_lowercase())
                .or_insert_with(|| content.split_whitespace().collect::<Vec<_>>().join(" "));
        }
    }
    output
}

pub(super) fn enrich_from_page(
    draft: &mut DoiMetadataDraft,
    metadata: &BTreeMap<String, String>,
    evidence: &mut Vec<TypeEvidence>,
) {
    let conference = metadata
        .get("citation_conference_title")
        .or_else(|| metadata.get("citation_conference"))
        .cloned()
        .unwrap_or_default();
    if matches!(draft.item_type.as_str(), "bookSection" | "document") && !conference.is_empty() {
        draft.item_type = "conferencePaper".to_owned();
        draft.conference_name = conference.clone();
        evidence.push(TypeEvidence {
            kind: "embedded-citation-conference",
            value: conference.clone(),
        });
        draft.proceedings_title = metadata
            .get("citation_inbook_title")
            .or_else(|| metadata.get("citation_book_title"))
            .cloned()
            .unwrap_or_else(|| std::mem::take(&mut draft.container_title));
        draft.container_title.clear();
    }
    if draft.item_type == "conferencePaper" {
        if draft.conference_name.is_empty() {
            draft.conference_name = conference;
        }
        if draft.proceedings_title.is_empty() {
            draft.proceedings_title = metadata
                .get("citation_inbook_title")
                .or_else(|| metadata.get("citation_book_title"))
                .cloned()
                .unwrap_or_default();
        }
        if draft.place.is_empty() {
            draft.place = metadata
                .get("citation_conference_location")
                .or_else(|| metadata.get("citation_publisher_place"))
                .cloned()
                .unwrap_or_default();
        }
    }
}
