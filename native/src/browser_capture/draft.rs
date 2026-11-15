use super::*;
use research_workbench_native_sdk::{catalog::CatalogCreator, catalog_save::CatalogDraft};
use std::collections::HashSet;

pub fn draft_from_capture(item: &Value) -> Result<CatalogDraft, CaptureRejectionV1> {
    if !item.is_object() {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    let original_type = text(item, "itemType")?;
    let title = text(item, "title")?;
    if original_type.is_empty() || title.trim().is_empty() {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    // The source record retains every unsupported field/type. The receipt makes
    // this projection visible rather than silently describing an unknown type.
    let item_type = if crate::metadata::validate_item_type(&original_type).is_ok() {
        original_type
    } else {
        "document".to_owned()
    };
    let creators = match item.get("creators") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(creators)) => creators.iter().map(creator).collect::<Result<_, _>>()?,
        _ => return Err(CaptureRejectionV1::InvalidInput),
    };
    let mut tags = match item.get("tags") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(tags)) => tags
            .iter()
            .map(|tag| {
                if let Some(tag) = tag.as_str() {
                    Ok(tag.to_owned())
                } else if tag.is_object() {
                    text(tag, "tag")
                } else {
                    Err(CaptureRejectionV1::InvalidInput)
                }
            })
            .collect::<Result<_, _>>()?,
        _ => return Err(CaptureRejectionV1::InvalidInput),
    };
    // Library tags are case-insensitively unique; preserve the original list in
    // raw_json while projecting repeated translator labels only once.
    let mut seen_tags = HashSet::new();
    tags.retain(|tag: &String| seen_tags.insert(tag.trim().to_lowercase()));
    let date = text(item, "date")?;
    let issued_year = date
        .split(|c: char| !c.is_ascii_digit())
        .find(|part| part.len() == 4)
        .and_then(|year| year.parse::<i32>().ok())
        .filter(|year| *year > 0);
    let publication_title = text(item, "publicationTitle")?;
    let book_title = text(item, "bookTitle")?;
    let proceedings_title = if item_type == "conferencePaper" {
        publication_title.clone()
    } else {
        text(item, "proceedingsTitle")?
    };
    Ok(CatalogDraft {
        id: None,
        item_type,
        title,
        abstract_text: text(item, "abstractNote")?,
        issued_year,
        container_title: if publication_title.is_empty() {
            book_title
        } else {
            publication_title
        },
        conference_name: text(item, "conferenceName")?,
        proceedings_title,
        place: text(item, "place")?,
        volume: text(item, "volume")?,
        issue: text(item, "issue")?,
        pages: text(item, "pages")?,
        doi: text(item, "DOI")?,
        url: text(item, "url")?,
        language: text(item, "language")?,
        bibtex_key: text(item, "citationKey")?,
        raw_bibtex: None,
        creators,
        tags,
        source_kind: Some("browser_connector".to_owned()),
    })
}

pub fn creator(value: &Value) -> Result<CatalogCreator, CaptureRejectionV1> {
    if !value.is_object() {
        return Err(CaptureRejectionV1::InvalidInput);
    }
    let name = text(value, "name")?;
    let last_name = text(value, "lastName")?;
    let literal = value["fieldMode"] == 1 || !name.is_empty();
    let role = text(value, "creatorType")?;
    Ok(CatalogCreator {
        family_name: if literal {
            String::new()
        } else {
            last_name.clone()
        },
        given_name: if literal {
            String::new()
        } else {
            text(value, "firstName")?
        },
        literal_name: if !name.is_empty() {
            name
        } else if literal {
            last_name
        } else {
            String::new()
        },
        role: if role.is_empty() {
            "author".to_owned()
        } else {
            role
        },
    })
}
