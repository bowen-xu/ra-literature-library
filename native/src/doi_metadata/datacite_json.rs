use serde_json::Value;

use super::model::{DoiCreator, DoiMetadataDraft, DoiMetadataError, TypeEvidence, value_string};

fn datacite_creator(value: &Value, role: &str) -> DoiCreator {
    DoiCreator {
        family: value_string(value.get("familyName")),
        given: value_string(value.get("givenName")),
        literal: value_string(value.get("name")),
        role: role.to_owned(),
    }
}

fn contributor_role(value: &Value) -> &'static str {
    match value_string(value.get("contributorType"))
        .to_ascii_lowercase()
        .as_str()
    {
        "editor" => "editor",
        "producer" => "producer",
        _ => "contributor",
    }
}

fn datacite_type(types: &Value) -> &'static str {
    let citeproc = value_string(types.get("citeproc"));
    let mut item_type = match citeproc.as_str() {
        "article" => "preprint",
        "book" => "book",
        "chapter" => "bookSection",
        "article-journal" => "journalArticle",
        "article-magazine" => "magazineArticle",
        "article-newspaper" => "newspaperArticle",
        "paper-conference" => "conferencePaper",
        "manuscript" => "manuscript",
        "thesis" => "thesis",
        "report" => "report",
        "dataset" => "dataset",
        "webpage" | "post-weblog" => "webpage",
        "patent" => "patent",
        _ => "journalArticle",
    };
    let schema_org = value_string(types.get("schemaOrg")).to_ascii_lowercase();
    if [
        "softwaresourcecode",
        "softwareapplication",
        "mobileapplication",
        "videogame",
        "webapplication",
    ]
    .contains(&schema_org.as_str())
    {
        item_type = "computerProgram";
    }
    if value_string(types.get("resourceTypeGeneral")) == "BookChapter" {
        item_type = "bookSection";
    }
    item_type
}

fn datacite_title(attributes: &Value) -> String {
    let mut title = String::new();
    let mut alternate = String::new();
    for entry in attributes
        .get("titles")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let value = value_string(entry.get("title"));
        if value.is_empty() {
            continue;
        }
        let kind = value_string(entry.get("titleType"));
        if kind.is_empty() {
            title.push_str(&value);
        } else if kind.eq_ignore_ascii_case("subtitle") {
            title.push_str(": ");
            title.push_str(&value);
        } else if alternate.is_empty() {
            alternate = value;
        }
    }
    if title.is_empty() { alternate } else { title }
}

fn datacite_year(attributes: &Value) -> Option<i32> {
    let dates = attributes.get("dates").and_then(Value::as_array);
    for wanted in [
        "Issued",
        "Updated",
        "Available",
        "Accepted",
        "Submitted",
        "Created",
    ] {
        if let Some(date) = dates
            .into_iter()
            .flatten()
            .find(|date| value_string(date.get("dateType")).eq_ignore_ascii_case(wanted))
        {
            let value = value_string(date.get("date"));
            if let Ok(year) = value.get(..4).unwrap_or(&value).parse() {
                return Some(year);
            }
        }
    }
    value_string(attributes.get("publicationYear")).parse().ok()
}

fn page_range(container: &Value) -> String {
    let first = value_string(container.get("firstPage"));
    let last = value_string(container.get("lastPage"));
    if first.is_empty() || last.is_empty() || first == last {
        format!("{first}{last}")
    } else {
        format!("{first}-{last}")
    }
}

fn container_title(container: &Value) -> String {
    container
        .get("titles")
        .and_then(Value::as_array)
        .and_then(|titles| titles.first())
        .map(|title| value_string(title.get("title")))
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| value_string(container.get("title")))
}

pub(super) fn parse_datacite_json(
    doi: &str,
    body: &str,
) -> Result<(DoiMetadataDraft, Vec<TypeEvidence>), DoiMetadataError> {
    let root: Value = serde_json::from_str(body)
        .map_err(|error| DoiMetadataError::Parse(format!("DataCite JSON 格式无效：{error}")))?;
    let attributes = root
        .get("data")
        .and_then(|data| data.get("attributes"))
        .unwrap_or(&root);
    let resource = attributes.get("types").unwrap_or(&Value::Null);
    let general = value_string(resource.get("resourceTypeGeneral"));
    let specific = value_string(resource.get("resourceType"));
    let item_type = datacite_type(resource);
    let mut creators: Vec<_> = attributes
        .get("creators")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|creator| datacite_creator(creator, "author"))
        .collect();
    creators.extend(
        attributes
            .get("contributors")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|contributor| datacite_creator(contributor, contributor_role(contributor))),
    );
    let published_in = attributes
        .get("relatedItems")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|item| value_string(item.get("relationType")) == "IsPublishedIn");
    if let Some(container) = published_in {
        creators.extend(
            container
                .get("contributors")
                .or_else(|| container.get("contributor"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|contributor| datacite_creator(contributor, contributor_role(contributor))),
        );
    }
    creators.dedup();
    let evidence = (item_type == "conferencePaper")
        .then(|| TypeEvidence {
            kind: "doi-format",
            value: format!("{general} {specific}").trim().to_owned(),
        })
        .into_iter()
        .collect();
    Ok((
        DoiMetadataDraft {
            item_type: item_type.to_owned(),
            title: datacite_title(attributes),
            abstract_text: attributes
                .get("descriptions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .find(|value| value_string(value.get("descriptionType")) == "Abstract")
                .map(|value| value_string(value.get("description")))
                .unwrap_or_default(),
            issued_year: datacite_year(attributes),
            container_title: published_in
                .map(container_title)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| {
                    attributes
                        .get("container")
                        .map(container_title)
                        .unwrap_or_default()
                }),
            conference_name: String::new(),
            proceedings_title: String::new(),
            place: String::new(),
            volume: published_in
                .map(|container| value_string(container.get("volume")))
                .or_else(|| {
                    attributes
                        .get("container")
                        .map(|container| value_string(container.get("volume")))
                })
                .unwrap_or_default(),
            issue: published_in
                .map(|container| value_string(container.get("issue")))
                .unwrap_or_default(),
            pages: published_in
                .map(page_range)
                .filter(|value| !value.is_empty())
                .or_else(|| attributes.get("container").map(page_range))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| {
                    attributes
                        .get("sizes")
                        .and_then(Value::as_array)
                        .map(|values| {
                            values
                                .iter()
                                .filter_map(Value::as_str)
                                .collect::<Vec<_>>()
                                .join(", ")
                        })
                        .unwrap_or_default()
                }),
            doi: doi.to_owned(),
            url: value_string(attributes.get("url")),
            language: value_string(attributes.get("language")),
            creators,
            tags: attributes
                .get("subjects")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|subject| value_string(subject.get("subject")))
                .filter(|subject| !subject.is_empty())
                .collect(),
        },
        evidence,
    ))
}
