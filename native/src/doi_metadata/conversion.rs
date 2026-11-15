//! One original field conversion, shared by static and hosted DOI consumers.
use super::DoiMetadataResult;
use research_workbench_native_sdk::{
    catalog::CatalogCreator, catalog_save::CatalogDraft, doi_metadata::DoiTranslationV1,
};

impl From<DoiMetadataResult> for DoiTranslationV1 {
    fn from(result: DoiMetadataResult) -> Self {
        let draft = CatalogDraft {
            id: None,
            item_type: result.draft.item_type,
            title: result.draft.title,
            abstract_text: result.draft.abstract_text,
            issued_year: result.draft.issued_year,
            container_title: result.draft.container_title,
            conference_name: result.draft.conference_name,
            proceedings_title: result.draft.proceedings_title,
            place: result.draft.place,
            volume: result.draft.volume,
            issue: result.draft.issue,
            pages: result.draft.pages,
            doi: result.draft.doi,
            url: result.draft.url,
            language: result.draft.language,
            bibtex_key: String::new(),
            raw_bibtex: None,
            creators: result
                .draft
                .creators
                .into_iter()
                .map(|creator| CatalogCreator {
                    family_name: creator.family,
                    given_name: creator.given,
                    literal_name: creator.literal,
                    role: creator.role,
                })
                .collect(),
            tags: result.draft.tags,
            source_kind: Some(result.source_kind.clone()),
        };
        DoiTranslationV1 {
            draft,
            raw_payload: result.raw_payload,
            source_kind: result.source_kind,
            warnings: result.warnings,
        }
    }
}
