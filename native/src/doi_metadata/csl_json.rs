use serde_json::Value;

use super::model::{
    DoiMetadataDraft, DoiMetadataError, NonEmptyString, TypeEvidence, date_year, json_creators,
    value_string,
};

fn csl_type(work_type: &str, publisher: &str) -> &'static str {
    match work_type {
        "journal-article" | "article-journal" => "journalArticle",
        "article-magazine" => "magazineArticle",
        "article-newspaper" => "newspaperArticle",
        "proceedings" | "proceedings-article" | "proceedings-series" | "paper-conference" => {
            "conferencePaper"
        }
        "book" | "book-series" | "book-set" | "book-track" | "monograph" | "reference-book"
        | "edited-book" | "collection" => "book",
        "book-chapter" | "book-part" | "book-section" | "reference-entry" | "chapter"
        | "content_item" => "bookSection",
        "posted-content" | "article" if publisher.eq_ignore_ascii_case("arxiv") => "preprint",
        "posted-content" | "preprint" => "preprint",
        "manuscript" | "peer-review" => "manuscript",
        "dissertation" | "thesis" => "thesis",
        "report" | "report-series" | "report-component" => "report",
        "dataset" | "database" => "dataset",
        "software" | "computer-program" => "computerProgram",
        "webpage" | "post" | "post-weblog" => "webpage",
        "standard" => "standard",
        "patent" => "patent",
        _ => "document",
    }
}

fn assertion_value(root: &Value, names: &[&str]) -> String {
    root.get("assertion")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|assertion| {
            let name = value_string(assertion.get("name"));
            names
                .iter()
                .any(|candidate| name.eq_ignore_ascii_case(candidate))
        })
        .map(|assertion| value_string(assertion.get("value")))
        .unwrap_or_default()
}

pub(super) fn parse_csl_json(
    doi: &str,
    body: &str,
) -> Result<(DoiMetadataDraft, Vec<TypeEvidence>), DoiMetadataError> {
    let root: Value = serde_json::from_str(body)
        .map_err(|error| DoiMetadataError::Parse(format!("DOI JSON 元数据格式无效：{error}")))?;
    let work_type = value_string(root.get("type"));
    let publisher = value_string(root.get("publisher"));
    let mut item_type = csl_type(&work_type, &publisher).to_owned();
    let mut evidence = Vec::new();
    if item_type == "conferencePaper" {
        evidence.push(TypeEvidence {
            kind: "doi-format",
            value: work_type.clone(),
        });
    }
    let event = root.get("event");
    let conference_name = value_string(root.get("event-title"))
        .or_else_nonempty(|| event.map(|event| value_string(event.get("name"))));
    let assertion_conference = assertion_value(
        &root,
        &["conference_name", "conference_acronym", "conference_id"],
    );
    let conference_name = if conference_name.is_empty() {
        assertion_conference
    } else {
        conference_name
    };
    if matches!(item_type.as_str(), "bookSection" | "document") && !conference_name.is_empty() {
        item_type = "conferencePaper".to_owned();
        evidence.push(TypeEvidence {
            kind: "crossref-event-or-assertion",
            value: conference_name.clone(),
        });
    }
    let place = value_string(root.get("event-place"))
        .or_else_nonempty(|| event.map(|event| value_string(event.get("location"))))
        .or_else_nonempty(|| Some(assertion_value(&root, &["conference_location"])));
    let container = value_string(root.get("container-title"));
    let issued_year = date_year(root.get("issued"))
        .or_else(|| date_year(root.get("published")))
        .or_else(|| date_year(root.get("published-print")));
    let mut creators = Vec::new();
    for (field, role) in [
        ("author", "author"),
        ("editor", "editor"),
        ("translator", "translator"),
        ("container-author", "bookAuthor"),
        ("collection-editor", "seriesEditor"),
    ] {
        creators.extend(json_creators(root.get(field), role));
    }
    let tags = root
        .get("keyword")
        .and_then(Value::as_str)
        .into_iter()
        .flat_map(|keywords| keywords.split([',', ';']))
        .map(str::trim)
        .filter(|keyword| !keyword.is_empty())
        .map(str::to_owned)
        .collect();
    Ok((
        DoiMetadataDraft {
            item_type: item_type.clone(),
            title: value_string(root.get("title")),
            abstract_text: value_string(root.get("abstract")),
            issued_year,
            container_title: if item_type == "conferencePaper" {
                String::new()
            } else {
                container.clone()
            },
            conference_name,
            proceedings_title: if item_type == "conferencePaper" {
                container
            } else {
                String::new()
            },
            place,
            volume: value_string(root.get("volume")),
            issue: value_string(root.get("issue")),
            pages: value_string(root.get("page")),
            doi: doi.to_owned(),
            url: value_string(root.get("URL").or_else(|| root.get("url"))),
            language: value_string(root.get("language")),
            creators,
            tags,
        },
        evidence,
    ))
}
