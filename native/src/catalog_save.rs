//! Original manual-save decisions. The caller owns IDs, persistence and transactions.
pub use research_workbench_native_sdk::catalog_save::{
    CatalogDraft, CatalogDuplicatePolicy, CatalogSaveInput, CatalogSaveItem, CatalogSaveOutcome,
    CatalogSavePlan, CatalogSaveProvenance, CatalogSaveRejection, PreparedDoi,
};

pub fn prepare(input: CatalogSaveInput) -> CatalogSaveOutcome {
    let CatalogSaveInput { draft, doi } = input;
    if !crate::metadata::policy::is_supported_item_type(&draft.item_type) {
        return CatalogSaveOutcome::Rejected {
            reason: CatalogSaveRejection::UnsupportedType {
                item_type: draft.item_type,
            },
        };
    }
    let title = draft.title.trim().to_owned();
    if title.is_empty() {
        return CatalogSaveOutcome::Rejected {
            reason: CatalogSaveRejection::EmptyTitle,
        };
    }
    let normalized_title = title.to_lowercase();
    let source_kind = draft.source_kind.unwrap_or_else(|| "user".into());
    let confirmed_by_user = source_kind == "user";
    CatalogSaveOutcome::Planned {
        plan: Box::new(CatalogSavePlan {
            item: CatalogSaveItem {
                id: draft.id,
                item_type: draft.item_type,
                title,
                abstract_text: draft.abstract_text.trim().into(),
                issued_year: draft.issued_year,
                container_title: draft.container_title.trim().into(),
                conference_name: draft.conference_name.trim().into(),
                proceedings_title: draft.proceedings_title.trim().into(),
                place: draft.place.trim().into(),
                volume: draft.volume.trim().into(),
                issue: draft.issue.trim().into(),
                pages: draft.pages.trim().into(),
                url: draft.url.trim().into(),
                language: draft.language.trim().into(),
                bibtex_key: draft.bibtex_key.trim().into(),
                raw_bibtex: draft.raw_bibtex,
            },
            creators: draft
                .creators
                .into_iter()
                .map(|mut creator| {
                    creator.family_name = creator.family_name.trim().into();
                    creator.given_name = creator.given_name.trim().into();
                    creator.literal_name = creator.literal_name.trim().into();
                    creator
                })
                .collect(),
            doi: (!doi.normalized.is_empty()).then_some(doi),
            tags: draft
                .tags
                .into_iter()
                .map(|tag| tag.trim().to_owned())
                .filter(|tag| !tag.is_empty())
                .collect(),
            provenance: CatalogSaveProvenance {
                fields: [
                    "itemType",
                    "title",
                    "abstractText",
                    "issuedYear",
                    "containerTitle",
                    "conferenceName",
                    "proceedingsTitle",
                    "place",
                    "volume",
                    "issue",
                    "pages",
                    "doi",
                    "url",
                    "language",
                    "bibtexKey",
                    "creators",
                    "tags",
                ]
                .into_iter()
                .map(str::to_owned)
                .collect(),
                source_kind,
                confirmed_by_user,
            },
            duplicates: CatalogDuplicatePolicy {
                normalized_title,
                doi_reason: "doi".into(),
                doi_confidence: 1.0,
                title_reason: "normalized_title_year".into(),
                title_confidence: 0.72,
            },
        }),
    }
}

#[cfg(test)]
mod tests;
