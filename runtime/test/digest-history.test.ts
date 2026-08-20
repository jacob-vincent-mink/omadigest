import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DigestHistory } from "../src/digest-history.js";
import type { Digest } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(id: string): Digest {
  return {
    id, templateId: "general", title: `Digest ${id}`, generatedAt: "2026-08-20T10:00:00.000Z",
    sections: [{ title: "Act now", entries: [] }]
  };
}

describe("DigestHistory", () => {
  it("saves newest first and supports deletion", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-history-"));
    roots.push(root);
    const history = new DigestHistory({ XDG_STATE_HOME: root, HOME: root });
    history.save(fixture("00000000-0000-4000-8000-000000000001"));
    history.save(fixture("00000000-0000-4000-8000-000000000002"));
    expect(history.list().map((item) => item.id)).toEqual([
      "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"
    ]);
    history.delete("00000000-0000-4000-8000-000000000002");
    expect(history.list()).toHaveLength(1);
    history.clear();
    expect(history.list()).toEqual([]);
  });
});
