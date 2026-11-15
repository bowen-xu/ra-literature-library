//! Original RRF fusion, revision filtering, tie order and eight-seed limit.
use research_workbench_native_sdk::concept_retrieval::{
    CandidateRankV1, ConceptIdentityV1, ConceptRetrievalSeed, LexicalHitV1, VectorObservationV1,
};
use std::collections::BTreeMap;

pub fn rank_candidates(
    lexical_hits: &[LexicalHitV1],
    vector_hits: &[VectorObservationV1],
) -> Vec<CandidateRankV1> {
    let mut ranks = BTreeMap::<String, CandidateRankV1>::new();
    let empty = |concept_id: &str| CandidateRankV1 {
        concept_id: concept_id.into(),
        lexical_rank: None,
        vector_rank: None,
        vector_distance_bits: None,
        vector_revision: None,
    };
    for hit in lexical_hits {
        ranks
            .entry(hit.concept_id.clone())
            .or_insert_with(|| empty(&hit.concept_id))
            .lexical_rank = Some(hit.rank);
    }
    for (index, hit) in vector_hits.iter().enumerate() {
        if !hit.valid {
            continue;
        }
        let state = ranks
            .entry(hit.concept_id.clone())
            .or_insert_with(|| empty(&hit.concept_id));
        state.vector_rank = Some(i64::try_from(index).unwrap_or(i64::MAX).saturating_add(1));
        state.vector_distance_bits = Some(hit.distance_bits);
        state.vector_revision = Some(hit.subject_revision);
    }
    ranks.into_values().collect()
}

pub fn project_seed(
    ranks: &CandidateRankV1,
    identity: Option<ConceptIdentityV1>,
) -> Option<ConceptRetrievalSeed> {
    let ConceptIdentityV1 {
        revision,
        label,
        preferred_term,
    } = identity?;
    if ranks.vector_rank.is_some()
        && ranks.vector_revision != Some(revision)
        && ranks.lexical_rank.is_none()
    {
        return None;
    }
    let rrf_score =
        ranks.lexical_rank.map(rrf).unwrap_or(0.0) + ranks.vector_rank.map(rrf).unwrap_or(0.0);
    let mut matched_by = Vec::new();
    if ranks.lexical_rank.is_some() {
        matched_by.push("lexical".to_owned());
    }
    if ranks.vector_rank.is_some() && ranks.vector_revision == Some(revision) {
        matched_by.push("vector".to_owned());
    }
    Some(ConceptRetrievalSeed {
        concept_id: ranks.concept_id.clone(),
        concept_revision: revision,
        label,
        preferred_term,
        matched_by,
        lexical_rank: ranks.lexical_rank,
        vector_rank: ranks
            .vector_rank
            .filter(|_| ranks.vector_revision == Some(revision)),
        vector_distance: ranks
            .vector_distance_bits
            .filter(|_| ranks.vector_revision == Some(revision))
            .map(f32::from_bits),
        rrf_score,
    })
}

pub fn select_seeds(mut seeds: Vec<ConceptRetrievalSeed>) -> Vec<ConceptRetrievalSeed> {
    seeds.sort_by(|left, right| {
        right
            .rrf_score
            .total_cmp(&left.rrf_score)
            .then_with(|| left.concept_id.cmp(&right.concept_id))
    });
    seeds.truncate(8);
    seeds
}

fn rrf(rank: i64) -> f64 {
    1.0 / (60.0 + rank as f64)
}
