//! Original identity qualification over Core-owned finite observations.
pub(super) fn merge_rationale(characters: usize) -> Option<&'static str> {
    (characters > 2_000).then_some("概念合并说明过长")
}
pub(super) fn merge_shape(
    count: usize,
    empty: bool,
    duplicate: bool,
    includes_survivor: bool,
) -> Option<&'static str> {
    if count == 0 || count > 10 || empty {
        Some("概念合并参数无效")
    } else if duplicate || includes_survivor {
        Some("概念合并目标重复或包含保留节点")
    } else {
        None
    }
}
pub(super) fn split_shape(
    count: usize,
    characters: usize,
    duplicate: bool,
) -> Option<&'static str> {
    if count == 0 || count > 10 || characters > 2_000 {
        Some("概念拆回参数无效")
    } else if duplicate {
        Some("概念拆回目标重复")
    } else {
        None
    }
}
pub(super) fn target(mapped: bool, children: bool) -> Option<&'static str> {
    (mapped || children).then_some("概念已参与其他活动映射，请先拆回再合并")
}
pub(super) fn split_event(is_merge: bool, active: bool) -> Option<&'static str> {
    (!is_merge || !active).then_some("只能拆回仍属于该合并事件的旧概念 ID")
}
pub(super) fn mapping_deleted(changed: usize) -> Option<&'static str> {
    (changed != 1).then_some("概念映射已变化，请重新预览")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_identity_shape_order_and_limits_are_preserved() {
        assert_eq!(merge_rationale(2_000), None);
        assert_eq!(merge_rationale(2_001), Some("概念合并说明过长"));
        assert_eq!(merge_shape(0, false, true, true), Some("概念合并参数无效"));
        assert_eq!(
            merge_shape(11, false, false, false),
            Some("概念合并参数无效")
        );
        assert_eq!(
            merge_shape(1, false, true, false),
            Some("概念合并目标重复或包含保留节点")
        );
        assert_eq!(
            merge_shape(1, false, false, true),
            Some("概念合并目标重复或包含保留节点")
        );
        assert_eq!(merge_shape(10, false, false, false), None);
        assert_eq!(split_shape(0, 2_001, true), Some("概念拆回参数无效"));
        assert_eq!(split_shape(10, 2_000, true), Some("概念拆回目标重复"));
        assert_eq!(split_shape(10, 2_000, false), None);
    }
    #[test]
    fn original_mapping_qualification_and_deletion_result_are_preserved() {
        assert_eq!(target(false, false), None);
        for (mapped, children) in [(true, false), (false, true), (true, true)] {
            assert_eq!(
                target(mapped, children),
                Some("概念已参与其他活动映射，请先拆回再合并")
            );
        }
        assert_eq!(split_event(true, true), None);
        assert_eq!(
            split_event(false, true),
            Some("只能拆回仍属于该合并事件的旧概念 ID")
        );
        assert_eq!(
            split_event(true, false),
            Some("只能拆回仍属于该合并事件的旧概念 ID")
        );
        assert_eq!(mapping_deleted(1), None);
        for changed in [0, 2, usize::MAX] {
            assert_eq!(mapping_deleted(changed), Some("概念映射已变化，请重新预览"));
        }
    }
}
