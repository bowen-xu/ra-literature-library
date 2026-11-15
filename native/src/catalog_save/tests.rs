use super::*;
use serde_json::json;
use sha2::{Digest, Sha256};

fn input() -> CatalogSaveInput {
    serde_json::from_value(json!({
        "draft":{"itemType":"document","title":"  Title  "},
        "doi":{"display":"10.1000/Example","normalized":"10.1000/example"}
    }))
    .unwrap()
}

fn plan(input: CatalogSaveInput) -> CatalogSavePlan {
    match prepare(input) {
        CatalogSaveOutcome::Planned { plan } => *plan,
        rejected => panic!("expected planned synthetic input, got {rejected:?}"),
    }
}

#[test]
fn only_the_original_sixteen_types_are_allowed_before_the_empty_title_check() {
    for item_type in [
        "journalArticle",
        "magazineArticle",
        "newspaperArticle",
        "conferencePaper",
        "book",
        "bookSection",
        "preprint",
        "manuscript",
        "thesis",
        "report",
        "dataset",
        "computerProgram",
        "webpage",
        "standard",
        "patent",
        "document",
    ] {
        let mut value = input();
        value.draft.item_type = item_type.into();
        assert_eq!(plan(value).item.item_type, item_type);
    }
    for item_type in ["", " document", "Document", "unknown\0type"] {
        let mut value = input();
        value.draft.item_type = item_type.into();
        value.draft.title = " \t\n ".into();
        assert_eq!(
            prepare(value),
            CatalogSaveOutcome::Rejected {
                reason: CatalogSaveRejection::UnsupportedType {
                    item_type: item_type.into()
                }
            }
        );
    }
    let mut value = input();
    value.draft.title = " \u{a0}\t\n ".into();
    assert_eq!(
        prepare(value),
        CatalogSaveOutcome::Rejected {
            reason: CatalogSaveRejection::EmptyTitle
        }
    );
}

#[test]
fn all_main_bindings_trim_exactly_the_original_fields_and_keep_raw_bibtex_and_identity() {
    let mut value = input();
    value.draft = serde_json::from_value(json!({
        "id":" raw\0 ID ","itemType":"conferencePaper","title":" \u{a0}İSTANBUL 文献\t ",
        "abstractText":" abstract\0text ","issuedYear":-2147483648_i32,
        "containerTitle":" container ","conferenceName":" conference ",
        "proceedingsTitle":" proceedings ","place":" place ","volume":" volume ",
        "issue":" issue ","pages":" pages ","url":" url ","language":" language ",
        "bibtexKey":" key ","rawBibtex":" \n@article{ raw\0bytes }\t "
    }))
    .unwrap();
    let plan = plan(value);
    assert_eq!(
        serde_json::to_value(&plan.item).unwrap(),
        json!({"id":" raw\0 ID ","itemType":"conferencePaper","title":"İSTANBUL 文献",
            "abstractText":"abstract\0text","issuedYear":-2147483648_i32,
            "containerTitle":"container","conferenceName":"conference",
            "proceedingsTitle":"proceedings","place":"place","volume":"volume",
            "issue":"issue","pages":"pages","url":"url","language":"language",
            "bibtexKey":"key","rawBibtex":" \n@article{ raw\0bytes }\t "})
    );
    assert_eq!(plan.duplicates.normalized_title, "i\u{307}stanbul 文献");
}

#[test]
fn missing_and_empty_ids_null_bibtex_and_nul_titles_gain_no_new_domain_constraints() {
    let mut value = input();
    value.draft.title = "\0".into();
    assert_eq!(plan(value.clone()).item.id, None);
    value.draft.id = Some(String::new());
    value.draft.issued_year = Some(i32::MAX);
    let plan = plan(value);
    assert_eq!(plan.item.id, Some(String::new()));
    assert_eq!(plan.item.title, "\0");
    assert_eq!(plan.item.raw_bibtex, None);
    assert_eq!(plan.item.issued_year, Some(i32::MAX));
}

#[test]
fn creators_keep_order_blank_entries_and_raw_roles_and_tags_are_never_deduplicated() {
    let mut value = input();
    value.draft.creators = serde_json::from_value(json!([
        {"familyName":" F ","givenName":" G ","literalName":" L ","role":" raw role "},
        {"familyName":" ","givenName":"\t","literalName":"\n","role":""}
    ]))
    .unwrap();
    value.draft.tags = vec![
        " Tag ".into(),
        "tag".into(),
        "Tag".into(),
        " \u{a0} ".into(),
    ];
    let plan = plan(value);
    assert_eq!(
        serde_json::to_value(plan.creators).unwrap(),
        json!([
            {"familyName":"F","givenName":"G","literalName":"L","role":" raw role "},
            {"familyName":"","givenName":"","literalName":"","role":""}
        ])
    );
    assert_eq!(plan.tags, vec!["Tag", "tag", "Tag"]);
}

#[test]
fn prepared_shared_doi_bytes_are_reused_and_only_exact_empty_normalized_omits_the_record() {
    let mut value = input();
    value.draft.doi = "not parsed here".into();
    value.doi = PreparedDoi {
        display: " parser output\0 ".into(),
        normalized: " normalized\0 ".into(),
    };
    assert_eq!(plan(value.clone()).doi, Some(value.doi.clone()));
    value.doi.normalized.clear();
    assert_eq!(plan(value.clone()).doi, None);
    value.doi.normalized = " ".into();
    assert_eq!(plan(value.clone()).doi, Some(value.doi));
}

#[test]
fn provenance_default_exact_user_flag_and_all_original_field_positions_are_preserved() {
    for (source, expected_source, confirmed) in [
        (None, "user", true),
        (Some("user"), "user", true),
        (Some(" user "), " user ", false),
        (Some("User"), "User", false),
        (Some(""), "", false),
        (Some("crossref"), "crossref", false),
    ] {
        let mut value = input();
        value.draft.source_kind = source.map(str::to_owned);
        let plan = plan(value);
        assert_eq!(plan.provenance.source_kind, expected_source);
        assert_eq!(plan.provenance.confirmed_by_user, confirmed);
        assert_eq!(
            plan.provenance.fields,
            [
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
        );
    }
}

#[test]
fn duplicate_policy_retains_doi_priority_constants_and_original_unicode_lowercase() {
    let mut value = input();
    value.draft.title = "  ÄBC Σ  ".into();
    let policy = plan(value).duplicates;
    assert_eq!(policy.normalized_title, "äbc σ");
    assert_eq!(policy.doi_reason, "doi");
    assert_eq!(policy.doi_confidence, 1.0);
    assert_eq!(policy.title_reason, "normalized_title_year");
    assert_eq!(policy.title_confidence, 0.72);
}

#[test]
fn all_fifteen_save_resources_retain_the_original_literal_bytes_without_a_final_newline() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("data");
    for (name, expected) in [
        (
            "item-upsert",
            "6f7ddffe61a35dbc2e66c8da2b50de4e79727a12fed70fd495c6073c163ed9f1",
        ),
        (
            "creators-delete",
            "13c62ed27d970e8e06ea6aace3c68ad17f888158c607f153c16301a76b4715df",
        ),
        (
            "creator-insert",
            "07bfe5f3af2af4c91c1b83ce58d4ebdc37f4997c7511727a854f17f983665c82",
        ),
        (
            "item-creator-insert",
            "57faab3c1fe50d94067873eaf2f56911276ec2ebc2f50abada657997a6d27486",
        ),
        (
            "doi-delete",
            "e54a1504c616dfe6a4579f9483e8bdf565af107be70b0e565ee32e66457fb1ea",
        ),
        (
            "doi-insert",
            "1d4ee8d0fceff7d624015d0cec545275e71c41e9753649e27c9621a1b6fbfd5b",
        ),
        (
            "tags-delete",
            "2f5a3b6dcfa53d3fb0975b05c4cfbf18a910be8e626748cf3b9815a858891b6d",
        ),
        (
            "tag-insert",
            "c213b388dda8117f5447ecf50a659cc800282efb6f10484c39b0ea892666e813",
        ),
        (
            "item-tag-insert",
            "813c9e10e962e1dd198898f6bfeda78cdac1b182b6522d3ba43cf661044ea751",
        ),
        (
            "provenance-upsert",
            "5ca945be6d3f1dc220c0e5097af1d5e7883436be5ac25907015ce845d533e9bc",
        ),
        (
            "search-delete",
            "715c7a5add6de4717ac9e65b14e27cfabe82ede482fda066a46ae900837ea9fe",
        ),
        (
            "search-insert",
            "2b090db8c7abc5eaa72bfafdaf1ca5320a2347d6fc3adb1ed77e2b81824cc85f",
        ),
        (
            "duplicate-doi-ids",
            "b82b95a3375089d1fd34387874d884796bd54d150d8342972354a22a6ae36c48",
        ),
        (
            "duplicate-title-ids",
            "47c4901a1491a88ae5de26fcff197a177165d824eaa3f3973d47ee9ffa7241d6",
        ),
        (
            "duplicate-insert",
            "ebd0065d6ed08984a1bd96c02a4b8e4e20ef46a7a0416f6000a0da29ae1e167b",
        ),
    ] {
        let bytes = std::fs::read(root.join(format!("catalog-save-{name}.v1.sql"))).unwrap();
        assert_ne!(bytes.last(), Some(&b'\n'));
        assert_eq!(format!("{:x}", Sha256::digest(&bytes)), expected, "{name}");
    }
}
