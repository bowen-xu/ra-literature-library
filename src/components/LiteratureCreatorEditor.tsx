import { Check, Plus, Trash2, X } from "lucide-react";
import type { LiteratureCreator } from "@research-assistant/core/literature";

import { creatorRoleLabel } from "./literatureDetailModel";

interface LiteratureCreatorEditorProps {
  readonly allowedRoles: readonly string[];
  readonly creators: readonly LiteratureCreator[];
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onChange: (creators: readonly LiteratureCreator[]) => void;
  readonly onSave: () => void;
}

function editableName(creator: LiteratureCreator): string {
  return creator.literalName || [creator.familyName, creator.givenName].filter(Boolean).join(", ");
}

function updateCreatorName(creator: LiteratureCreator, value: string): LiteratureCreator {
  if (creator.literalName.length > 0 && !value.includes(",")) {
    return { ...creator, familyName: "", givenName: "", literalName: value };
  }
  const [familyName = "", givenName = ""] = value.split(",").map((part) => part.trim());
  return { ...creator, familyName, givenName, literalName: "" };
}

function hasCreatorName(creator: LiteratureCreator): boolean {
  return creator.literalName.trim().length > 0
    || creator.familyName.trim().length > 0
    || creator.givenName.trim().length > 0;
}

export function normalizedLiteratureCreators(
  creators: readonly LiteratureCreator[],
): readonly LiteratureCreator[] {
  return creators.filter(hasCreatorName);
}

export function LiteratureCreatorEditor({
  allowedRoles,
  creators,
  disabled,
  onCancel,
  onChange,
  onSave,
}: LiteratureCreatorEditorProps): React.JSX.Element {
  const availableRoles = [...new Set([...allowedRoles, ...creators.map((creator) => creator.role)])];
  const primaryRole = allowedRoles[0] ?? "author";

  function updateCreator(index: number, next: LiteratureCreator): void {
    onChange(creators.map((creator, currentIndex) => currentIndex === index ? next : creator));
  }

  return (
    <div aria-label="编辑创作者" className="metadata-creator-editor">
      {creators.map((creator, index) => (
        <div className="metadata-creator-row" key={`${creator.role}-${index}`}>
          <input
            aria-label={`创作者姓名 ${index + 1}`}
            autoFocus={index === 0}
            data-tab-action="both"
            disabled={disabled}
            onChange={(event) => updateCreator(index, updateCreatorName(creator, event.target.value))}
            placeholder="姓, 名"
            value={editableName(creator)}
          />
          <select
            aria-label={`创作者角色 ${index + 1}`}
            data-tab-action="both"
            disabled={disabled}
            onChange={(event) => updateCreator(index, { ...creator, role: event.target.value })}
            value={creator.role}
          >
            {availableRoles.map((role) => <option key={role} value={role}>{creatorRoleLabel(role)}</option>)}
          </select>
          <button
            aria-label={`移除创作者 ${index + 1}`}
            className="metadata-creator-remove"
            disabled={disabled}
            onClick={() => onChange(creators.filter((_, currentIndex) => currentIndex !== index))}
            type="button"
          >
            <Trash2 aria-hidden="true" size={14} />
          </button>
        </div>
      ))}
      <div className="metadata-creator-actions">
        <button
          aria-label="添加创作者"
          className="metadata-creator-add"
          disabled={disabled}
          onClick={() => onChange([...creators, {
            familyName: "", givenName: "", literalName: "", role: primaryRole,
          }])}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />添加创作者
        </button>
        <div className="metadata-creator-commit-actions">
          <button aria-label="取消编辑创作者" className="metadata-creator-cancel" disabled={disabled} onClick={onCancel} type="button">
            <X aria-hidden="true" size={14} />取消
          </button>
          <button aria-label="保存创作者" className="metadata-creator-save" disabled={disabled} onClick={onSave} type="button">
            <Check aria-hidden="true" size={14} />保存
          </button>
        </div>
      </div>
    </div>
  );
}
