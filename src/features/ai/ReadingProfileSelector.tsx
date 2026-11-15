import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ReadingProfile,
  PaperReadingProfileSelection,
  ReadingProfileRef,
  StructuredReadingUnitKind,
} from "@research-assistant/core/knowledge";

import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import {
  researchKnowledgeErrorMessage,
  type ResearchKnowledgeGateway,
} from "../../services/knowledgeGateway";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { usePopoverStore } from "@ariakit/react";
import { Popover } from "@research-assistant/workbench-sdk/overlay";

interface ReadingProfileSelectorProps {
  readonly busy: boolean;
  readonly gateway: ResearchKnowledgeGateway;
  readonly paperId: string;
  readonly onSelectionChanged: (
    fields: readonly StructuredReadingUnitKind[],
    confirmedSelection?: PaperReadingProfileSelection,
  ) => void;
}

function profileKey(profile: ReadingProfileRef): string {
  return `${profile.profileId}:${profile.profileVersion}`;
}

function sameKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((key) => right.has(key));
}

export function ReadingProfileSelector({
  busy,
  gateway,
  paperId,
  onSelectionChanged,
}: ReadingProfileSelectorProps): React.JSX.Element {
  const selectorRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<readonly ReadingProfile[]>([]);
  const [draftKeys, setDraftKeys] = useState<ReadonlySet<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const [isPersisted, setIsPersisted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const popover = usePopoverStore({open: isOpen, setOpen: next => { if (!next) close(true); }, placement: "bottom-end"});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setIsOpen(false);
    setProfiles([]);
    setDraftKeys(new Set());
    setSavedKeys(new Set());
    setRevision(0);
    setIsPersisted(false);
    void Promise.all([
      gateway.listReadingProfiles(),
      gateway.getPaperReadingProfileSelection(paperId),
    ]).then(([available, selection]) => {
      if (!active) return;
      const keys = new Set(selection.profiles.map(profileKey));
      setProfiles(available);
      setDraftKeys(keys);
      setSavedKeys(keys);
      setRevision(selection.revision);
      setIsPersisted(selection.isPersisted);
    }).catch((reason: unknown) => {
      if (active) notify.error(researchKnowledgeErrorMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [gateway, paperId]);

  useEffect(() => {
    const selected = profiles.filter((profile) => savedKeys.has(profileKey(profile)));
    const fields = profiles.flatMap((profile) =>
      savedKeys.has(profileKey(profile)) ? profile.fieldKinds : []);
    onSelectionChanged(
      [...new Set(fields)],
      isPersisted ? {
        paperId,
        profiles: selected.map(({ profileId, profileVersion }) => ({
          profileId,
          profileVersion,
        })),
        revision,
        isPersisted: true,
      } : undefined,
    );
  }, [isPersisted, onSelectionChanged, paperId, profiles, revision, savedKeys]);

  function open(): void {
    popover.setAnchorElement(triggerRef.current);
    popover.setDisclosureElement(triggerRef.current);
    setDraftKeys(new Set(savedKeys));
    setIsOpen(true);
  }

  function close(restoreFocus: boolean): void {
    if (saving) return;
    setDraftKeys(new Set(savedKeys));
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function toggle(profile: ReadingProfile, checked: boolean): void {
    setDraftKeys((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= 3) return current;
        next.add(profileKey(profile));
      } else {
        next.delete(profileKey(profile));
      }
      return next;
    });
  }

  async function save(): Promise<void> {
    const selected = profiles.filter((profile) => draftKeys.has(profileKey(profile)));
    setSaving(true);
    try {
      const saved = await gateway.savePaperReadingProfileSelection({
        paperId,
        profiles: selected.map(({ profileId, profileVersion }) => ({
          profileId,
          profileVersion,
        })),
        expectedRevision: revision,
        changeReason: "manual_profile_confirmation",
      });
      const keys = new Set(saved.profiles.map(profileKey));
      setRevision(saved.revision);
      setIsPersisted(saved.isPersisted);
      setSavedKeys(keys);
      setDraftKeys(keys);
      setIsOpen(false);
      triggerRef.current?.focus();
      notify.success(`${saved.profiles.length === 0 ? "未指定阅读框架" : "阅读框架组合"}已保存`);
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；当前选择仍保留。`);
    } finally {
      setSaving(false);
    }
  }

  const selectedProfiles = profiles.filter((profile) => savedKeys.has(profileKey(profile)));
  const summary = selectedProfiles.length === 0
    ? "未指定"
    : selectedProfiles.map((profile) => profile.label).join(" + ");
  const isDirty = !isPersisted || !sameKeys(draftKeys, savedKeys);
  const controlsDisabled = busy || saving || loading;

  return (
    <section aria-busy={loading} className="reading-profile-selector" ref={selectorRef}>
      <div className="reading-profile-summary-row">
        <div className="reading-profile-summary-main">
          <ContentTrustIndicator
            size="small"
            status={isPersisted && savedKeys.size > 0 ? "trusted" : "neutral"}
            subjectLabel="阅读框架"
          />
          <strong>阅读框架</strong>
          <ControlHint content={summary}><span className="reading-profile-current">{summary}</span></ControlHint>
        </div>
        <ControlHint content={isOpen ? "收起阅读框架选择" : "展开阅读框架选择"}><button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={isOpen ? "收起阅读框架选择" : "展开阅读框架选择"}
          className="reading-profile-config-action"
          disabled={loading}
          onClick={() => { if (isOpen) close(false); else open(); }}
          ref={triggerRef}
          type="button"
        >
          {isOpen
            ? <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
            : <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.8} />}
        </button></ControlHint>
      </div>

      {loading && <span className="reading-profile-loading" role="status">正在读取阅读框架…</span>}
      {isOpen && (
        <Popover store={popover} fixed modal={false} gutter={6} fitViewport hideOnEscape={!saving} hideOnInteractOutside={!saving}
          aria-label="配置阅读框架"
          aria-modal="false"
          className="reading-profile-popover"
          ref={popoverRef}
          role="dialog"
        >
          <header>
            <div>
              <strong>选择阅读框架</strong>
              <small>可以不指定，或组合最多三个框架</small>
            </div>
          </header>
          <div className="reading-profile-options">
            <label
              className={`reading-profile-unspecified ${draftKeys.size === 0 ? "selected" : ""}`}
            >
              <input
                checked={draftKeys.size === 0}
                disabled={controlsDisabled}
                name="reading-profile-selection"
                onChange={() => setDraftKeys(new Set())}
                type="radio"
              />
              <span><strong>未指定</strong><small>由后续 AI 判断，或稍后人工选择</small></span>
            </label>
            {profiles.map((profile) => {
              const key = profileKey(profile);
              const checked = draftKeys.has(key);
              return (
                <label className={checked ? "selected" : ""} key={key}>
                  <input
                    checked={checked}
                    disabled={controlsDisabled || !checked && draftKeys.size >= 3}
                    onChange={(event) => toggle(profile, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{profile.label}</strong>
                    <small>{profile.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
          <p>框架只组织提取字段，不表示论文类型已客观确定。</p>
          <footer>
            <button disabled={saving} onClick={() => close(true)} type="button">取消</button>
            <button className="primary" disabled={controlsDisabled || !isDirty} onClick={() => void save()} type="button">
              {saving ? "保存中…" : "保存"}
            </button>
          </footer>
        </Popover>
      )}
    </section>
  );
}
