use std::collections::BTreeMap;

use super::{DOI_ACCEPT, adapter_for};
use crate::doi_metadata::{
    crossref_xml::parse_crossref_xml,
    csl_json::parse_csl_json,
    datacite_json::parse_datacite_json,
    embedded_metadata::{embedded_metadata, enrich_from_page},
    model::DoiMetadataDraft,
};

#[test]
fn uses_zotero_content_negotiation_order_and_dispatches_formats() {
    assert_eq!(
        DOI_ACCEPT,
        "application/vnd.datacite.datacite+json, application/vnd.crossref.unixref+xml, application/vnd.citationstyles.csl+json"
    );
    assert_eq!(
        adapter_for("<doi_records><crossref/></doi_records>"),
        "crossref-unixref-xml"
    );
    assert_eq!(adapter_for(r#"{"agency": "DataCite"}"#), "datacite-json");
    assert_eq!(adapter_for(r#"{"type":"journal-article"}"#), "csl-json");
}

#[test]
fn parses_datacite_preprint_and_csl_journal_without_changing_types() {
    let datacite = r#"{"data":{"attributes":{"titles":[{"title":"A preprint"}],"types":{"resourceTypeGeneral":"Text","resourceType":"Preprint","citeproc":"article"},"publicationYear":2024,"creators":[{"familyName":"Lu","givenName":"Chris"}],"contributors":[{"familyName":"Smith","givenName":"Alex","contributorType":"Editor"}]}}}"#;
    let (draft, _) =
        parse_datacite_json("10.48550/arxiv.example", datacite).expect("parse DataCite fixture");
    assert_eq!(draft.item_type, "preprint");
    assert_eq!(draft.creators[0].family, "Lu");
    assert_eq!(draft.creators[0].role, "author");
    assert_eq!(draft.creators[1].role, "editor");

    let csl = r#"{"type":"journal-article","title":"An article","container-title":"Nature","issued":{"date-parts":[[2026]]}}"#;
    let (draft, _) = parse_csl_json("10.1000/journal", csl).expect("parse CSL fixture");
    assert_eq!(draft.item_type, "journalArticle");
    assert_eq!(draft.container_title, "Nature");
    assert_eq!(draft.issued_year, Some(2026));
}

#[test]
fn datacite_follows_zotero_title_date_container_and_subject_rules() {
    let body = r#"{
      "types":{"citeproc":"chapter","resourceTypeGeneral":"BookChapter"},
      "titles":[{"title":"Main title"},{"title":"Subtitle","titleType":"Subtitle"}],
      "dates":[{"date":"2024-02-03","dateType":"Created"},{"date":"2025-04-05","dateType":"Issued"}],
      "publicationYear":"2023",
      "descriptions":[{"description":"Ignore note","descriptionType":"Other"},{"description":"Keep abstract","descriptionType":"Abstract"}],
      "subjects":[{"subject":"metadata"},{"subject":"DOI"}],
      "relatedItems":[{"relationType":"IsPublishedIn","titles":[{"title":"Collected Work"}],"volume":"2","issue":"4","firstPage":"11","lastPage":"19","contributors":[{"familyName":"Editor","givenName":"Erin","contributorType":"Editor"}]}]
    }"#;
    let (draft, _) = parse_datacite_json("10.1000/datacite", body).expect("parse DataCite");
    assert_eq!(draft.item_type, "bookSection");
    assert_eq!(draft.title, "Main title: Subtitle");
    assert_eq!(draft.issued_year, Some(2025));
    assert_eq!(draft.abstract_text, "Keep abstract");
    assert_eq!(draft.container_title, "Collected Work");
    assert_eq!(draft.volume, "2");
    assert_eq!(draft.issue, "4");
    assert_eq!(draft.pages, "11-19");
    assert_eq!(draft.tags, ["metadata", "DOI"]);
    assert_eq!(draft.creators[0].role, "editor");
}

#[test]
fn rejects_malformed_json_and_xml() {
    assert!(parse_csl_json("10.1000/bad", "{").is_err());
    assert!(parse_datacite_json("10.1000/bad", "[").is_err());
    assert!(parse_crossref_xml("10.1000/bad", "<crossref>").is_err());
}

#[test]
fn embedded_metadata_accepts_attribute_order_and_promotes_conference() {
    let html = r#"<meta content="International Conference on Artificial &amp; General Intelligence" name="citation_conference_title"><META NAME='citation_inbook_title' CONTENT='Artificial General Intelligence'>"#;
    let metadata = embedded_metadata(html);
    let mut draft = DoiMetadataDraft {
        item_type: "bookSection".to_owned(),
        container_title: "Lecture Notes in Computer Science".to_owned(),
        ..DoiMetadataDraft::default()
    };
    let mut evidence = Vec::new();
    enrich_from_page(&mut draft, &metadata, &mut evidence);
    assert_eq!(draft.item_type, "conferencePaper");
    assert_eq!(
        draft.conference_name,
        "International Conference on Artificial & General Intelligence"
    );
    assert_eq!(draft.proceedings_title, "Artificial General Intelligence");
    assert_eq!(evidence[0].kind, "embedded-citation-conference");
}

#[test]
fn proceedings_words_alone_do_not_promote_a_book_section() {
    let body = r#"{"type":"book-chapter","title":"Paper","container-title":"LNCS Proceedings"}"#;
    let (draft, evidence) = parse_csl_json("10.1000/example", body).expect("parse CSL");
    assert_eq!(draft.item_type, "bookSection");
    assert!(evidence.is_empty());
}

#[test]
fn crossref_assertion_is_explicit_conference_evidence() {
    let body = r#"{"type":"book-chapter","title":"Paper","container-title":"LNCS","assertion":[{"name":"conference_name","value":"AGI"},{"name":"conference_location","value":"Reykjavik, Iceland"}]}"#;
    let (draft, evidence) = parse_csl_json("10.1000/example", body).expect("parse CSL");
    assert_eq!(draft.item_type, "conferencePaper");
    assert_eq!(draft.conference_name, "AGI");
    assert_eq!(draft.place, "Reykjavik, Iceland");
    assert_eq!(evidence[0].kind, "crossref-event-or-assertion");
}

#[test]
fn crossref_xml_distinguishes_conference_from_plain_book_content() {
    let conference = r#"<crossref><conference><event_metadata><conference_name>TestConf</conference_name><conference_location>Paris</conference_location></event_metadata><proceedings_metadata><proceedings_title>Proceedings Title</proceedings_title><publication_date><year>2026</year></publication_date><conference_paper><titles><title>A paper</title></titles></conference_paper></proceedings_metadata></conference></crossref>"#;
    let (draft, _) = parse_crossref_xml("10.1000/conf", conference).expect("parse conference");
    assert_eq!(draft.item_type, "conferencePaper");
    assert_eq!(draft.conference_name, "TestConf");

    let chapter = r#"<crossref><book><book_metadata><titles><title>An Ordinary Book</title></titles></book_metadata><content_item component_type='chapter'><titles><title>A chapter</title></titles></content_item></book></crossref>"#;
    let (draft, _) = parse_crossref_xml("10.1000/chapter", chapter).expect("parse chapter");
    assert_eq!(draft.item_type, "bookSection");
}

#[test]
fn springer_agi_fixture_uses_explicit_evidence_and_conference_fields() {
    let unixref = r#"<crossref><book book_type='other'><book_series_metadata><contributors><person_name sequence='first' contributor_role='editor'><given_name>Matthew</given_name><surname>Iklé</surname></person_name><person_name sequence='additional' contributor_role='editor'><given_name>Arthur</given_name><surname>Franz</surname></person_name><person_name sequence='additional' contributor_role='editor'><given_name>Andrew</given_name><surname>Kemendo</surname></person_name><person_name sequence='additional' contributor_role='editor'><given_name>Haley</given_name><surname>Lowy</surname></person_name></contributors><titles><title>Artificial General Intelligence</title><subtitle>18th International Conference, AGI 2025, Reykjavik, Iceland, August 12–15, 2025, Proceedings</subtitle></titles><publication_date><year>2026</year></publication_date></book_series_metadata><content_item component_type='chapter'><contributors><person_name sequence='first' contributor_role='author'><given_name>Bowen</given_name><surname>Xu</surname></person_name><person_name sequence='additional' contributor_role='author'><given_name>Boyang</given_name><surname>Xu</surname></person_name><person_name sequence='additional' contributor_role='author'><given_name>Pei</given_name><surname>Wang</surname></person_name></contributors><titles><title>Vision by Logic: A Naïve Visual Recognition Model with Non-axiomatic Logic</title></titles><assertion name='conference_name'>International Conference on Artificial General Intelligence</assertion><assertion name='conference_location'>Reykjavik, Iceland</assertion></content_item></book></crossref>"#;
    let (mut draft, mut evidence) = parse_crossref_xml("10.1007/978-3-032-33195-3_30", unixref)
        .expect("parse AGI Unixref fixture");
    let page = embedded_metadata(
        r#"<meta name='citation_conference_title' content='International Conference on Artificial General Intelligence'><meta content='Artificial General Intelligence' name='citation_inbook_title'>"#,
    );
    enrich_from_page(&mut draft, &page, &mut evidence);

    assert_eq!(draft.item_type, "conferencePaper");
    assert_eq!(
        draft.conference_name,
        "International Conference on Artificial General Intelligence"
    );
    assert_eq!(draft.proceedings_title, "Artificial General Intelligence");
    assert_eq!(draft.place, "Reykjavik, Iceland");
    assert_eq!(
        draft
            .creators
            .iter()
            .filter(|creator| creator.role == "author")
            .map(|creator| format!("{} {}", creator.given, creator.family))
            .collect::<Vec<_>>(),
        vec!["Bowen Xu", "Boyang Xu", "Pei Wang"]
    );
    assert_eq!(
        draft
            .creators
            .iter()
            .filter(|creator| creator.role == "editor")
            .map(|creator| creator.family.as_str())
            .collect::<Vec<_>>(),
        vec!["Iklé", "Franz", "Kemendo", "Lowy"]
    );
}

#[test]
fn ordinary_springer_chapter_fixture_remains_book_section() {
    let unixref = r#"<crossref><book><book_metadata><titles><title>Studies in Writing</title></titles></book_metadata><content_item component_type='chapter'><titles><title>An ordinary chapter</title></titles></content_item></book></crossref>"#;
    let (mut draft, mut evidence) = parse_crossref_xml("10.1007/0-387-24250-3_4", unixref)
        .expect("parse ordinary Springer chapter");
    enrich_from_page(&mut draft, &BTreeMap::new(), &mut evidence);
    assert_eq!(draft.item_type, "bookSection");
}
