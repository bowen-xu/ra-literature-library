//! Original batch ordering and empty-input decision; SQL remains package data.
pub use research_workbench_native_sdk::literature_lifecycle::{
    LifecyclePreparationV1, LifecycleRejectionCodeV1, LifecycleRejectionV1, LifecycleRequestV1,
};
use std::collections::BTreeSet;

pub fn prepare(request: LifecycleRequestV1) -> LifecyclePreparationV1 {
    let trash_item_ids = match &request {
        LifecycleRequestV1::TrashMany { item_ids } => {
            if item_ids.is_empty() {
                return LifecyclePreparationV1::Rejected {
                    error: LifecycleRejectionV1 {
                        code: LifecycleRejectionCodeV1::NotFound,
                        message: "部分文献已归档、删除或不存在，请刷新后重试".into(),
                    },
                };
            }
            item_ids
                .iter()
                .cloned()
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect()
        }
        LifecycleRequestV1::Archive { .. }
        | LifecycleRequestV1::Restore { .. }
        | LifecycleRequestV1::Trash { .. }
        | LifecycleRequestV1::RestoreTrash { .. }
        | LifecycleRequestV1::SetProjects { .. } => Vec::new(),
    };
    LifecyclePreparationV1::Ready {
        request,
        trash_item_ids,
    }
}

#[cfg(test)]
mod tests;
