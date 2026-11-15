import { describe, expect, it } from "vitest";
import { emptyLiteratureDraft } from "@research-assistant/core/literature";

import {
  applyLiteratureCreatorInput,
  createLiteratureCreatorInput,
  updateLiteratureCreatorInput,
} from "./literatureCreatorInput";
import { normalizedLiteratureCreators } from "./LiteratureCreatorEditor";

describe("literature creator input", () => {
  it("preserves a trailing space while an author name is still being typed", () => {
    const initial = createLiteratureCreatorInput([]);
    const firstName = updateLiteratureCreatorInput(initial, "Bowen");
    const separatingSpace = updateLiteratureCreatorInput(firstName, "Bowen ");

    expect(separatingSpace.value).toBe("Bowen ");

    const completeName = updateLiteratureCreatorInput(separatingSpace, "Bowen Xu");
    const draft = applyLiteratureCreatorInput(emptyLiteratureDraft(), completeName);

    expect(draft.creators).toEqual([
      { familyName: "Bowen Xu", givenName: "", literalName: "", role: "author" },
    ]);
  });

  it("parses comma-separated names only when the edited draft is applied", () => {
    const initial = createLiteratureCreatorInput([]);
    const incomplete = updateLiteratureCreatorInput(initial, "Xu, ");

    expect(incomplete.value).toBe("Xu, ");

    const complete = updateLiteratureCreatorInput(incomplete, "Xu, Bowen; Lovelace, Ada");
    const draft = applyLiteratureCreatorInput(emptyLiteratureDraft(), complete);

    expect(draft.creators).toEqual([
      { familyName: "Xu", givenName: "Bowen", literalName: "", role: "author" },
      { familyName: "Lovelace", givenName: "Ada", literalName: "", role: "author" },
    ]);
  });

  it("edits authors without discarding container editors", () => {
    const draft = {
      ...emptyLiteratureDraft(),
      creators: [
        { familyName: "Xu", givenName: "Bowen", literalName: "", role: "author" },
        { familyName: "Iklé", givenName: "Matthew", literalName: "", role: "editor" },
      ],
    };
    const input = updateLiteratureCreatorInput(createLiteratureCreatorInput(draft.creators), "Wang, Pei");

    expect(createLiteratureCreatorInput(draft.creators).value).toBe("Xu, Bowen");
    expect(applyLiteratureCreatorInput(draft, input).creators).toEqual([
      { familyName: "Wang", givenName: "Pei", literalName: "", role: "author" },
      { familyName: "Iklé", givenName: "Matthew", literalName: "", role: "editor" },
    ]);
  });

  it("edits the Zotero-equivalent primary role for software without changing other roles", () => {
    const draft = {
      ...emptyLiteratureDraft(),
      itemType: "computerProgram" as const,
      creators: [
        { familyName: "Lovelace", givenName: "Ada", literalName: "", role: "programmer" },
        { familyName: "Xu", givenName: "Bo", literalName: "", role: "contributor" },
      ],
    };
    const input = updateLiteratureCreatorInput(createLiteratureCreatorInput(draft.creators, "programmer"), "Hopper, Grace");

    expect(applyLiteratureCreatorInput(draft, input).creators).toEqual([
      { familyName: "Hopper", givenName: "Grace", literalName: "", role: "programmer" },
      { familyName: "Xu", givenName: "Bo", literalName: "", role: "contributor" },
    ]);
  });

  it("removes only blank creator rows before saving a role-aware editor", () => {
    expect(normalizedLiteratureCreators([
      { familyName: "", givenName: "", literalName: "", role: "author" },
      { familyName: "Ng", givenName: "Andrew", literalName: "", role: "author" },
      { familyName: "", givenName: "", literalName: "OpenAI", role: "contributor" },
    ])).toEqual([
      { familyName: "Ng", givenName: "Andrew", literalName: "", role: "author" },
      { familyName: "", givenName: "", literalName: "OpenAI", role: "contributor" },
    ]);
  });
});
