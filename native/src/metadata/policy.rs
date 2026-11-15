//! Shared metadata constants do not depend on candidate/save preparation.
use research_workbench_native_sdk::metadata::{MetadataDerivationPolicyV1, MetadataTitleRuleV1};

pub const FIELD_NAMES: [&str; 17] = [
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
];

pub fn is_supported_item_type(item_type: &str) -> bool {
    matches!(
        item_type,
        "journalArticle"
            | "magazineArticle"
            | "newspaperArticle"
            | "conferencePaper"
            | "book"
            | "bookSection"
            | "preprint"
            | "manuscript"
            | "thesis"
            | "report"
            | "dataset"
            | "computerProgram"
            | "webpage"
            | "standard"
            | "patent"
            | "document"
    )
}

pub fn derivation_policy() -> MetadataDerivationPolicyV1 {
    MetadataDerivationPolicyV1 {
        title_rule: MetadataTitleRuleV1::UnicodeLowercase,
        doi_reason: "doi".into(),
        doi_confidence: 1.0,
        title_reason: "normalized_title_year".into(),
        title_confidence: 0.72,
    }
}
