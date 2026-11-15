//! Original foundation algorithm over owned rows, with no database or process owner.
use research_workbench_native_sdk::knowledge_promotion::{
    algorithms::{PaperFoundationSimilarity, SharedFoundationConcept},
    foundations::{FoundationInputV1, FoundationRejectionV1, PaperFoundations},
};
use std::collections::{BTreeMap, BTreeSet};

pub fn validate_scope(invalid_id: bool, count: usize) -> Option<&'static str> {
    if invalid_id {
        Some("共享理论基础分析包含无效论文 ID")
    } else if !(2..=50).contains(&count) {
        Some("共享理论基础分析必须选择 2 至 50 篇不同论文")
    } else {
        None
    }
}

pub fn calculate(
    input: &FoundationInputV1,
) -> Result<Vec<PaperFoundationSimilarity>, FoundationRejectionV1> {
    let paper_ids = &input.paper_ids;
    let papers = &input.papers;
    if let Some(message) = validate_scope(
        paper_ids.iter().any(|id| id.is_empty() || id.len() > 160),
        paper_ids.len(),
    ) {
        return Err(FoundationRejectionV1::InvalidInput {
            message: message.into(),
        });
    }
    let document_frequencies = document_frequencies(papers);
    let mut results = Vec::new();
    for (left_index, left_id) in paper_ids.iter().enumerate() {
        for right_id in paper_ids.iter().skip(left_index + 1) {
            let left = papers.get(left_id).ok_or(FoundationRejectionV1::NotFound)?;
            let right = papers
                .get(right_id)
                .ok_or(FoundationRejectionV1::NotFound)?;
            results.push(compare(
                i64::try_from(results.len()).unwrap_or(i64::MAX),
                left_id,
                left,
                right_id,
                right,
                &document_frequencies,
            ));
        }
    }
    results.sort_by(|left, right| {
        right
            .weighted_jaccard
            .total_cmp(&left.weighted_jaccard)
            .then_with(|| left.left_paper_id.cmp(&right.left_paper_id))
            .then_with(|| left.right_paper_id.cmp(&right.right_paper_id))
    });

    Ok(results)
}

fn document_frequencies(papers: &BTreeMap<String, PaperFoundations>) -> BTreeMap<String, usize> {
    let mut frequencies = BTreeMap::new();
    for paper in papers.values() {
        for concept_id in paper.concepts.keys() {
            *frequencies.entry(concept_id.clone()).or_insert(0) += 1;
        }
    }
    frequencies
}

fn compare(
    ordinal: i64,
    left_id: &str,
    left: &PaperFoundations,
    right_id: &str,
    right: &PaperFoundations,
    frequencies: &BTreeMap<String, usize>,
) -> PaperFoundationSimilarity {
    let left_ids = left.concepts.keys().cloned().collect::<BTreeSet<_>>();
    let right_ids = right.concepts.keys().cloned().collect::<BTreeSet<_>>();
    let union = left_ids.union(&right_ids).cloned().collect::<Vec<_>>();
    let shared = left_ids
        .intersection(&right_ids)
        .cloned()
        .collect::<Vec<_>>();
    let union_weight = union.iter().map(|id| weight(frequencies[id])).sum::<f64>();
    let shared_concepts = shared
        .iter()
        .filter_map(|id| left.concepts.get(id).map(|identity| (id, identity)))
        .map(|(id, identity)| SharedFoundationConcept {
            concept_id: id.clone(),
            concept_revision: identity.revision,
            label: identity.label.clone(),
            weight: weight(frequencies[id]),
        })
        .collect::<Vec<_>>();
    let shared_weight = shared_concepts.iter().map(|item| item.weight).sum::<f64>();
    PaperFoundationSimilarity {
        ordinal,
        left_paper_id: left_id.to_owned(),
        left_paper_title: left.title.clone(),
        right_paper_id: right_id.to_owned(),
        right_paper_title: right.title.clone(),
        shared_concept_count: i64::try_from(shared_concepts.len()).unwrap_or(i64::MAX),
        left_foundation_count: i64::try_from(left.concepts.len()).unwrap_or(i64::MAX),
        right_foundation_count: i64::try_from(right.concepts.len()).unwrap_or(i64::MAX),
        shared_concepts,
        weighted_jaccard: if union_weight == 0.0 {
            0.0
        } else {
            shared_weight / union_weight
        },
    }
}

fn weight(document_frequency: usize) -> f64 {
    1.0 / (1.0 + (document_frequency as f64).ln())
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::knowledge_promotion::foundations::FoundationIdentity;

    fn paper(title: &str, concepts: &[&str]) -> PaperFoundations {
        PaperFoundations {
            title: title.into(),
            concepts: concepts
                .iter()
                .map(|id| {
                    (
                        (*id).into(),
                        FoundationIdentity {
                            revision: 7,
                            label: format!("{title} {id} Ω"),
                        },
                    )
                })
                .collect(),
        }
    }

    #[test]
    fn original_weights_ranking_and_left_identity_are_preserved() {
        let input = FoundationInputV1 {
            paper_ids: vec!["a".into(), "b".into(), "c".into()],
            papers: BTreeMap::from([
                ("a".into(), paper("A", &["common", "rare"])),
                ("b".into(), paper("B", &["common"])),
                ("c".into(), paper("C", &["common"])),
            ]),
        };
        let rows = calculate(&input).unwrap();
        assert_eq!(
            rows.iter()
                .map(|r| (
                    r.left_paper_id.as_str(),
                    r.right_paper_id.as_str(),
                    r.ordinal
                ))
                .collect::<Vec<_>>(),
            [("b", "c", 2), ("a", "b", 0), ("a", "c", 1)]
        );
        let common = 1.0 / (1.0 + 3_f64.ln());
        assert_eq!(rows[0].weighted_jaccard, 1.0);
        assert_eq!(rows[1].weighted_jaccard, common / (common + 1.0));
        assert_eq!(rows[1].shared_concepts[0].weight, common);
        assert_eq!(rows[1].shared_concepts[0].label, "A common Ω");
        assert_eq!(rows[1].shared_concepts[0].concept_revision, 7);
        assert_eq!(rows[1].left_foundation_count, 2);
        assert_eq!(rows[1].right_foundation_count, 1);
    }

    #[test]
    fn original_fifty_paper_empty_graph_and_rejections_are_preserved() {
        let mut input = FoundationInputV1 {
            paper_ids: (0..50).map(|i| format!("p-{i:02}")).collect(),
            papers: BTreeMap::new(),
        };
        for id in &input.paper_ids {
            input.papers.insert(id.clone(), paper(id, &[]));
        }
        let rows = calculate(&input).unwrap();
        assert_eq!(rows.len(), 1225);
        assert!(
            rows.iter()
                .all(|r| r.weighted_jaccard == 0.0 && r.shared_concepts.is_empty())
        );
        assert_eq!(rows[0].left_paper_id, "p-00");
        assert_eq!(rows[0].right_paper_id, "p-01");
        input.papers.remove("p-49");
        assert_eq!(calculate(&input), Err(FoundationRejectionV1::NotFound));
        assert_eq!(
            validate_scope(true, 1),
            Some("共享理论基础分析包含无效论文 ID")
        );
        assert_eq!(
            validate_scope(false, 51),
            Some("共享理论基础分析必须选择 2 至 50 篇不同论文")
        );
        assert_eq!(validate_scope(false, 2), None);
        assert_eq!(validate_scope(false, 50), None);
    }
}
