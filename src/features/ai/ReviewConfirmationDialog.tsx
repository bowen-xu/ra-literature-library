import { useRef } from "react";
import { Dialog } from "@research-assistant/workbench-sdk/overlay";

export interface ReviewConfirmationGroup {
  readonly label: string;
  readonly untrustedCount: number;
  readonly reviewableCount: number;
  readonly note?: string;
}

interface ReviewConfirmationDialogProps {
  readonly title: string;
  readonly description: string;
  readonly groups: readonly ReviewConfirmationGroup[];
  readonly confirmLabel: string;
  readonly busy: boolean;
  readonly confirmTone?: "primary" | "danger";
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly warning?: string;
}

export function ReviewConfirmationDialog({
  title,
  description,
  groups,
  confirmLabel,
  busy,
  confirmTone = "primary",
  onCancel,
  onConfirm,
  warning = "确认表示你采纳这些内容为当前工作认识，不表示引用或结论已经得到事实证明。",
}: ReviewConfirmationDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open portal backdrop={false} hideOnInteractOutside={false} hideOnEscape={!busy} onClose={onCancel}
      initialFocus={confirmTone === "danger" ? cancelRef : confirmRef}
      aria-labelledby="review-confirmation-title"
      aria-modal="true"
      className="review-confirmation-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="review-confirmation-dialog">
        <header>
          <h3 id="review-confirmation-title">{title}</h3>
          <p>{description}</p>
        </header>
        <div className="review-confirmation-groups">
          {groups.map((group) => (
            <article key={group.label}>
              <strong>{group.label}</strong>
              <div>
                {group.untrustedCount > 0 && <span className="untrusted">红色 {group.untrustedCount}</span>}
                {group.reviewableCount > 0 && <span className="reviewable">黄色 {group.reviewableCount}</span>}
                {group.untrustedCount === 0 && group.reviewableCount === 0 && <span>没有可确认内容</span>}
              </div>
              {group.note !== undefined && <small>{group.note}</small>}
            </article>
          ))}
        </div>
        <p className="review-confirmation-warning">
          {warning}
        </p>
        <footer>
          <button disabled={busy} onClick={onCancel} ref={cancelRef} type="button">取消</button>
          <button className={confirmTone} disabled={busy} onClick={onConfirm} ref={confirmRef} type="button">
            {busy ? "正在处理…" : confirmLabel}
          </button>
        </footer>
      </section>
    </Dialog>
  );
}
