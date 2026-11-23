import type { BlockDragDom } from "@research-assistant/workbench-sdk/block-controls";

/** NAL supplies DOM ownership only; shared block code resolves geometry/motion. */
export const nalBlockDragDom: BlockDragDom = {
  outerSelector: "[data-nal-block-id]", contentSelector: "[data-nal-block-content]",
  owns: (root, hit) => root.contains(hit) || hit.contains(root)
    || hit.closest<HTMLElement>("[data-block-controls-surface]")?.dataset.blockControlsSurface === root.dataset.nalBlockSurface,
  contentId: (root, content) => root.contains(content) && content.closest("[data-nal-block-surface]") === root
    ? content.closest<HTMLElement>("[data-nal-block-id]")?.dataset.nalBlockId : undefined,
  idOf: outer => outer.dataset.nalBlockId,
  fixed: () => false, attached: () => false,
  scope: root => {
    const instance = root.dataset.nalBlockSurface;
    return instance === undefined ? undefined : {instance, selector: `[data-nal-block-surface="${CSS.escape(instance)}"]`};
  },
  rowSelector: id => `[data-nal-block-id="${CSS.escape(id)}"]`,
};
