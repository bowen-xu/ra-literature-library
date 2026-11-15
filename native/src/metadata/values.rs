use super::{LiteratureMetadataPatch, MetadataFieldDiff, MetadataRejectionV1};
use research_workbench_native_sdk::{catalog::CatalogItem, catalog_save::CatalogDraft};

/// Preserve raw draft strings and original Creator/tag JSON, not saved values.
/// DOI is the sole shared normalization supplied by Core's existing parser.
pub fn draft_values(draft: &CatalogDraft, normalized_doi: &str) -> Vec<(&'static str, String)> {
    vec![
        ("itemType", draft.item_type.clone()),
        ("title", draft.title.clone()),
        ("abstractText", draft.abstract_text.clone()),
        (
            "issuedYear",
            draft
                .issued_year
                .map(|value| value.to_string())
                .unwrap_or_default(),
        ),
        ("containerTitle", draft.container_title.clone()),
        ("conferenceName", draft.conference_name.clone()),
        ("proceedingsTitle", draft.proceedings_title.clone()),
        ("place", draft.place.clone()),
        ("volume", draft.volume.clone()),
        ("issue", draft.issue.clone()),
        ("pages", draft.pages.clone()),
        ("doi", normalized_doi.into()),
        ("url", draft.url.clone()),
        ("language", draft.language.clone()),
        ("bibtexKey", draft.bibtex_key.clone()),
        (
            "creators",
            serde_json::to_string(&draft.creators).unwrap_or_default(),
        ),
        (
            "tags",
            serde_json::to_string(&draft.tags).unwrap_or_default(),
        ),
    ]
}

pub fn draft_from_item(item: &CatalogItem) -> CatalogDraft {
    CatalogDraft {
        id: Some(item.id.clone()),
        item_type: item.item_type.clone(),
        title: item.title.clone(),
        abstract_text: item.abstract_text.clone(),
        issued_year: item.issued_year,
        container_title: item.container_title.clone(),
        conference_name: item.conference_name.clone(),
        proceedings_title: item.proceedings_title.clone(),
        place: item.place.clone(),
        volume: item.volume.clone(),
        issue: item.issue.clone(),
        pages: item.pages.clone(),
        doi: item.doi.clone(),
        url: item.url.clone(),
        language: item.language.clone(),
        bibtex_key: item.bibtex_key.clone(),
        raw_bibtex: item.raw_bibtex.clone(),
        creators: item.creators.clone(),
        tags: item.tags.clone(),
        source_kind: Some("user".into()),
    }
}

pub fn diffs(
    current: Option<&CatalogItem>,
    candidate: &CatalogDraft,
    current_normalized_doi: &str,
    candidate_normalized_doi: &str,
) -> Vec<MetadataFieldDiff> {
    let current_values =
        current.map(|item| draft_values(&draft_from_item(item), current_normalized_doi));
    let confirmed_fields = current
        .map(|item| {
            item.metadata_sources
                .iter()
                .filter(|source| source.confirmed_by_user)
                .map(|source| source.field_name.as_str())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    draft_values(candidate, candidate_normalized_doi)
        .into_iter()
        .filter_map(|(field_name, candidate_value)| {
            let current_value = current_values
                .as_ref()
                .and_then(|values| values.iter().find(|(name, _)| *name == field_name))
                .map(|(_, value)| value.clone())
                .unwrap_or_default();
            (current_value != candidate_value).then(|| MetadataFieldDiff {
                field_name: field_name.into(),
                current_value,
                candidate_value,
                user_confirmed: confirmed_fields.contains(&field_name),
            })
        })
        .collect()
}

pub fn patch_from_draft(
    field_name: &str,
    draft: &CatalogDraft,
) -> Result<LiteratureMetadataPatch, MetadataRejectionV1> {
    use LiteratureMetadataPatch::*;
    Ok(match field_name {
        "itemType" => ItemType(draft.item_type.clone()),
        "title" => Title(draft.title.clone()),
        "abstractText" => AbstractText(draft.abstract_text.clone()),
        "issuedYear" => IssuedYear(draft.issued_year),
        "containerTitle" => ContainerTitle(draft.container_title.clone()),
        "conferenceName" => ConferenceName(draft.conference_name.clone()),
        "proceedingsTitle" => ProceedingsTitle(draft.proceedings_title.clone()),
        "place" => Place(draft.place.clone()),
        "volume" => Volume(draft.volume.clone()),
        "issue" => Issue(draft.issue.clone()),
        "pages" => Pages(draft.pages.clone()),
        "doi" => Doi(draft.doi.clone()),
        "url" => Url(draft.url.clone()),
        "language" => Language(draft.language.clone()),
        "bibtexKey" => BibtexKey(draft.bibtex_key.clone()),
        "creators" => Creators(draft.creators.clone()),
        "tags" => Tags(draft.tags.clone()),
        other => {
            return Err(MetadataRejectionV1::InvalidFields {
                reason: other.into(),
            });
        }
    })
}
