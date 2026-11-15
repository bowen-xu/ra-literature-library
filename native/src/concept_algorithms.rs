//! Original concept algorithm qualifications and pure computation.
pub mod foundations;
use research_workbench_native_sdk::knowledge_promotion::algorithms::{
    AlgorithmIdKindV1, EvolutionEventKindV1,
};

pub fn validate_id(kind: AlgorithmIdKindV1, empty: bool, bytes: usize) -> Option<&'static str> {
    if !empty && bytes <= 160 {
        return None;
    }
    Some(match kind {
        AlgorithmIdKindV1::Evolution => "概念演化分析的 Concept ID 无效",
        AlgorithmIdKindV1::Run => "算法运行 ID 无效",
    })
}

pub fn event_kinds(statuses: &[Option<String>]) -> Result<Vec<EvolutionEventKindV1>, String> {
    if statuses.len() > 64 || statuses.iter().flatten().any(|value| value.len() > 64) {
        return Err("概念演化观察超出有限协议范围".into());
    }
    Ok(statuses
        .iter()
        .map(|status| event_kind(status.as_deref()))
        .collect())
}

fn event_kind(novelty_status: Option<&str>) -> EvolutionEventKindV1 {
    match novelty_status {
        Some("introduced_by_paper") => EvolutionEventKindV1::Introduced,
        Some("adapted_by_paper") => EvolutionEventKindV1::Adapted,
        Some("pre_existing") => EvolutionEventKindV1::Reused,
        _ => EvolutionEventKindV1::Unclear,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn original_id_limits_and_messages_are_preserved() {
        assert_eq!(validate_id(AlgorithmIdKindV1::Evolution, false, 160), None);
        assert_eq!(validate_id(AlgorithmIdKindV1::Run, false, 160), None);
        assert_eq!(
            validate_id(AlgorithmIdKindV1::Evolution, true, 0),
            Some("概念演化分析的 Concept ID 无效")
        );
        assert_eq!(
            validate_id(AlgorithmIdKindV1::Run, false, 161),
            Some("算法运行 ID 无效")
        );
    }

    #[test]
    fn original_novelty_mapping_and_unknown_values_are_preserved() {
        let input = [
            "introduced_by_paper",
            "adapted_by_paper",
            "pre_existing",
            "unclear",
            "other",
            " introduced_by_paper ",
        ];
        let statuses = input.map(|value| Some(value.to_owned()));
        assert_eq!(
            event_kinds(&statuses)
                .unwrap()
                .iter()
                .map(|kind| kind.as_str())
                .collect::<Vec<_>>(),
            [
                "introduced",
                "adapted",
                "reused",
                "unclear",
                "unclear",
                "unclear"
            ]
        );
        assert_eq!(
            event_kinds(&[None]).unwrap(),
            [EvolutionEventKindV1::Unclear]
        );
        assert!(event_kinds(&vec![None; 65]).is_err());
        assert!(event_kinds(&[Some("x".repeat(65))]).is_err());
    }
}
