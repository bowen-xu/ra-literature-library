//! Original DOI-first lookup, including its title fallback and query ordering.
use research_workbench_native_sdk::catalog::bibliography::{
    CandidatesInput, CandidatesPlan, CandidatesQuery,
};
pub fn search(
    input: &research_workbench_native_sdk::catalog::bibliography::SearchInput,
) -> Result<
    research_workbench_native_sdk::catalog::bibliography::SearchDecision,
    super::CatalogDecodeError,
> {
    use research_workbench_native_sdk::catalog::bibliography::{
        CitationSearchHit, SearchDecision, SearchInput,
    };
    Ok(match input {
        SearchInput::Prepare { query } => SearchDecision::Needle {
            needle: format!("%{}%", query.trim().to_lowercase()),
        },
        SearchInput::Project { rows } => SearchDecision::Hits {
            hits: rows
                .rows
                .iter()
                .enumerate()
                .map(|(index, values)| {
                    let row = super::Row::new(values, "citation search", index, 9)?;
                    Ok(CitationSearchHit {
                        literature_item_id: row.text(0)?,
                        title: row.text(1)?,
                        issued_year: row.year(2)?,
                        container_title: row.text(3)?,
                        imported_key: row.text(4)?,
                        first_author: row.text(5)?,
                        has_pdf: row.integer(6)? != 0,
                        has_evidence: row.integer(7)? != 0,
                        citation_key: row.optional_text(8)?,
                    })
                })
                .collect::<Result<_, super::CatalogDecodeError>>()?,
        },
    })
}
pub fn plan(input: &CandidatesInput) -> CandidatesPlan {
    let Some(primary) = &input.primary else {
        return if input.doi.is_empty() {
            CandidatesPlan::Query {
                query: CandidatesQuery::Title,
                parameter: input.title.clone(),
            }
        } else {
            CandidatesPlan::Query {
                query: CandidatesQuery::Doi,
                parameter: input.doi.clone(),
            }
        };
    };
    let exact_doi = !input.doi.is_empty() && !primary.is_empty();
    if primary.is_empty() && !input.doi.is_empty() {
        return match &input.fallback {
            None => CandidatesPlan::Query {
                query: CandidatesQuery::TitleFallback,
                parameter: input.title.clone(),
            },
            Some(ids) => CandidatesPlan::Ready {
                ids: ids.clone(),
                exact_doi,
            },
        };
    }
    CandidatesPlan::Ready {
        ids: primary.clone(),
        exact_doi,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::{
        catalog::bibliography::{SearchDecision, SearchInput},
        data::{DataRows, DataValue},
    };
    #[test]
    fn search_keeps_wildcards_unicode_lowercase_nullable_year_and_key() {
        assert_eq!(
            search(&SearchInput::Prepare {
                query: "  XU%_中文  ".into()
            })
            .unwrap(),
            SearchDecision::Needle {
                needle: "%xu%_中文%".into()
            }
        );
        let row = vec![
            DataValue::Text("id".into()),
            DataValue::Text("Title".into()),
            DataValue::Null,
            DataValue::Text("Venue".into()),
            DataValue::Text("Key".into()),
            DataValue::Text("Author".into()),
            DataValue::Integer(1),
            DataValue::Integer(0),
            DataValue::Null,
        ];
        let SearchDecision::Hits { hits } = search(&SearchInput::Project {
            rows: DataRows { rows: vec![row] },
        })
        .unwrap() else {
            panic!("hits");
        };
        assert_eq!(hits[0].issued_year, None);
        assert_eq!(hits[0].citation_key, None);
        assert!(hits[0].has_pdf);
        assert!(!hits[0].has_evidence);
    }
}
