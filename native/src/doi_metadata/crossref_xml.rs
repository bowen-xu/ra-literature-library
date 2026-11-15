use std::collections::BTreeMap;

use quick_xml::{
    Reader,
    events::{BytesStart, Event},
};

use super::model::{
    DoiCreator, DoiMetadataDraft, DoiMetadataError, NonEmptyString, TypeEvidence, clean_text,
};

#[derive(Debug)]
struct XmlLeaf {
    path: String,
    text: String,
}

fn xml_attribute(event: &BytesStart<'_>, name: &[u8]) -> Option<String> {
    event.attributes().flatten().find_map(|attribute| {
        attribute
            .key
            .local_name()
            .as_ref()
            .eq_ignore_ascii_case(name)
            .then(|| String::from_utf8_lossy(attribute.value.as_ref()).to_ascii_lowercase())
    })
}

fn xml_leaves(body: &str) -> Result<Vec<XmlLeaf>, DoiMetadataError> {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);
    let mut path = Vec::new();
    let mut text_stack: Vec<String> = Vec::new();
    let mut leaves = Vec::new();
    let mut person_index = 0_usize;
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let mut name =
                    String::from_utf8_lossy(event.local_name().as_ref()).to_ascii_lowercase();
                if name == "assertion"
                    && let Some(value) = xml_attribute(&event, b"name")
                {
                    name.push(':');
                    name.push_str(&value);
                } else if name == "person_name" {
                    person_index += 1;
                    let role = xml_attribute(&event, b"contributor_role")
                        .unwrap_or_else(|| "contributor".to_owned());
                    name = format!("person_name:{role}:{person_index}");
                }
                path.push(name);
                text_stack.push(String::new());
            }
            Ok(Event::Text(event)) => {
                if let Some(text) = text_stack.last_mut() {
                    text.push_str(&event.decode().unwrap_or_default());
                }
            }
            Ok(Event::CData(event)) => {
                if let Some(text) = text_stack.last_mut() {
                    text.push_str(&String::from_utf8_lossy(event.as_ref()));
                }
            }
            Ok(Event::End(_)) => {
                let text = text_stack.pop().unwrap_or_default();
                if !text.trim().is_empty() {
                    leaves.push(XmlLeaf {
                        path: path.join("/"),
                        text: clean_text(&text),
                    });
                }
                path.pop();
            }
            Ok(Event::Eof) if path.is_empty() => break,
            Ok(Event::Eof) => {
                return Err(DoiMetadataError::Parse(
                    "Crossref XML 格式无效：存在未闭合元素".to_owned(),
                ));
            }
            Ok(_) => {}
            Err(error) => {
                return Err(DoiMetadataError::Parse(format!(
                    "Crossref XML 格式无效：{error}"
                )));
            }
        }
    }
    Ok(leaves)
}

#[derive(Debug, Default)]
struct XmlPerson {
    path: String,
    role: String,
    given: String,
    family: String,
}

fn crossref_creators(leaves: &[XmlLeaf]) -> Vec<DoiCreator> {
    let mut people = BTreeMap::<usize, XmlPerson>::new();
    for leaf in leaves {
        let Some(segment) = leaf
            .path
            .split('/')
            .find(|segment| segment.starts_with("person_name:"))
        else {
            continue;
        };
        let mut parts = segment.split(':');
        let _element = parts.next();
        let role = parts.next().unwrap_or("contributor");
        let Some(index) = parts.next().and_then(|value| value.parse::<usize>().ok()) else {
            continue;
        };
        let person = people.entry(index).or_insert_with(|| XmlPerson {
            path: leaf.path.clone(),
            role: role.to_owned(),
            ..XmlPerson::default()
        });
        if leaf.path.ends_with("/given_name") {
            person.given.clone_from(&leaf.text);
        } else if leaf.path.ends_with("/surname") {
            person.family.clone_from(&leaf.text);
        }
    }

    let is_item_scope = |path: &str| {
        [
            "/content_item/",
            "/conference_paper/",
            "/journal_article/",
            "/dissertation/",
            "/posted_content/",
            "/report-paper_metadata/",
            "/report-paper_series_metadata/",
            "/standard_metadata/",
            "/peer_review/",
            "/dataset/",
        ]
        .iter()
        .any(|scope| path.contains(scope))
    };
    let has_scoped_people = people.values().any(|person| is_item_scope(&person.path));
    people
        .into_values()
        .filter(|person| {
            !has_scoped_people || is_item_scope(&person.path) || person.role != "author"
        })
        .filter(|person| !person.family.is_empty() || !person.given.is_empty())
        .map(|person| DoiCreator {
            family: person.family,
            given: person.given,
            literal: String::new(),
            role: if has_scoped_people && person.role == "author" && !is_item_scope(&person.path) {
                "bookAuthor".to_owned()
            } else {
                person.role
            },
        })
        .collect()
}

fn leaf(leaves: &[XmlLeaf], suffixes: &[&str]) -> String {
    suffixes
        .iter()
        .find_map(|suffix| leaves.iter().find(|leaf| leaf.path.ends_with(suffix)))
        .map(|leaf| leaf.text.clone())
        .unwrap_or_default()
}

pub(super) fn parse_crossref_xml(
    doi: &str,
    body: &str,
) -> Result<(DoiMetadataDraft, Vec<TypeEvidence>), DoiMetadataError> {
    let leaves = xml_leaves(body)?;
    let lower = body.to_ascii_lowercase();
    let explicit_conference = lower.contains("<conference") || lower.contains("<proceedings_");
    let has_content_item = lower.contains("<content_item");
    let assertion_conference = leaf(
        &leaves,
        &[
            "assertion:conference_name",
            "assertion:conference_acronym",
            "assertion:conference_id",
        ],
    );
    let mut item_type = if explicit_conference {
        "conferencePaper"
    } else if lower.contains("<journal_article") {
        "journalArticle"
    } else if lower.contains("<dissertation") {
        "thesis"
    } else if lower.contains("<report-paper") {
        "report"
    } else if lower.contains("<standard") {
        "standard"
    } else if lower.contains("<book") && has_content_item {
        "bookSection"
    } else if lower.contains("<book") {
        "book"
    } else {
        "document"
    }
    .to_owned();
    let title = leaf(
        &leaves,
        &[
            "content_item/titles/title",
            "journal_article/titles/title",
            "conference_paper/titles/title",
        ],
    );
    let book_title = leaf(
        &leaves,
        &[
            "book_metadata/titles/title",
            "book_series_metadata/titles/title",
            "proceedings_metadata/proceedings_title",
        ],
    );
    let conference_name = if explicit_conference {
        leaf(
            &leaves,
            &["conference_name", "event_metadata/conference_name"],
        )
    } else {
        assertion_conference
    };
    let creators = crossref_creators(&leaves);
    let mut evidence: Vec<_> = explicit_conference
        .then(|| TypeEvidence {
            kind: "crossref-unixref-conference",
            value: conference_name.clone(),
        })
        .into_iter()
        .collect();
    if matches!(item_type.as_str(), "bookSection" | "document") && !conference_name.is_empty() {
        item_type = "conferencePaper".to_owned();
        evidence.push(TypeEvidence {
            kind: "crossref-event-or-assertion",
            value: conference_name.clone(),
        });
    }
    Ok((
        DoiMetadataDraft {
            item_type: item_type.clone(),
            title,
            abstract_text: leaf(&leaves, &["abstract", "jats:abstract"]),
            issued_year: leaf(&leaves, &["publication_date/year", "conference_date/year"])
                .parse()
                .ok(),
            container_title: if item_type == "conferencePaper" {
                String::new()
            } else {
                book_title
                    .clone()
                    .or_else_nonempty(|| Some(leaf(&leaves, &["journal_metadata/full_title"])))
            },
            conference_name,
            proceedings_title: if item_type == "conferencePaper" {
                book_title
            } else {
                String::new()
            },
            place: leaf(
                &leaves,
                &[
                    "conference_location",
                    "assertion:conference_location",
                    "publisher_place",
                ],
            ),
            volume: leaf(&leaves, &["journal_volume/volume", "volume"]),
            issue: leaf(&leaves, &["journal_issue/issue", "issue"]),
            pages: {
                let first = leaf(&leaves, &["pages/first_page"]);
                let last = leaf(&leaves, &["pages/last_page"]);
                if first.is_empty() || last.is_empty() || first == last {
                    first
                } else {
                    format!("{first}-{last}")
                }
            },
            doi: doi.to_owned(),
            url: leaf(&leaves, &["resource"]),
            language: String::new(),
            creators,
            tags: Vec::new(),
        },
        evidence,
    ))
}
