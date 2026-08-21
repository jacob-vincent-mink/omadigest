import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const qmlFiles = ["BarWidget.qml", "Panel.qml", ...readdirSync(join(repositoryRoot, "components"))
  .filter((name) => name.endsWith(".qml"))
  .map((name) => join("components", name))];

describe("QML untrusted-text boundary", () => {
  it("renders every local Text element as plain text", () => {
    for (const relativePath of qmlFiles) {
      const lines = readFileSync(join(repositoryRoot, relativePath), "utf8").split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (!/^\s*Text\s*\{\s*$/u.test(lines[index]!)) continue;
        expect(lines[index + 1]?.trim(), `${relativePath}:${index + 1}`)
          .toBe("textFormat: Text.PlainText");
      }
    }
  });

  it("renders every editable or review TextArea as plain text", () => {
    for (const relativePath of qmlFiles) {
      const lines = readFileSync(join(repositoryRoot, relativePath), "utf8").split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (!/^\s*QQC\.TextArea\s*\{\s*$/u.test(lines[index]!)) continue;
        expect(lines[index + 1]?.trim(), `${relativePath}:${index + 1}`)
          .toBe("textFormat: TextEdit.PlainText");
      }
    }
  });

  it("does not delegate generated integration labels to host AutoText controls", () => {
    const card = readFileSync(join(repositoryRoot, "components", "IntegrationCard.qml"), "utf8");
    expect(card).not.toMatch(/^\s*Toggle\s*\{/mu);
    expect(card).not.toContain("root.status.action.label");
    expect(card).not.toContain("text: String(root.setup.actionLabel");
  });
});
