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

  it("keeps notification-history filesystem work out of QML", () => {
    const panel = readFileSync(join(repositoryRoot, "Panel.qml"), "utf8");
    expect(panel).not.toContain("historyReader");
    expect(panel).not.toContain("notificationHistoryDir");
    expect(panel).not.toContain("awk 1");
    expect(panel).toContain("OmaDigest.OmaDigestStore.refreshNotificationHistory()");
  });

  it("gates every costful or mutating demo IPC method", () => {
    const panel = readFileSync(join(repositoryRoot, "Panel.qml"), "utf8");
    expect(panel).toContain('Quickshell.env("OMADIGEST_DEMO_IPC") === "1"');
    const methods = [
      "previewDataDeletion", "startDraft", "prepareDraft", "submitDraft", "submitPreparedDraft",
      "showDraft", "acceptDraft", "editTemplate", "setupIntegration", "setupIntegrationDefaults",
      "enableIntegration", "checkIntegration", "previewRoute", "installAuthoringSkill", "generate",
      "beginFocus", "triggerFocusReentry"
    ];
    for (const method of methods) {
      const start = panel.indexOf(`function ${method}(`);
      expect(start, method).toBeGreaterThanOrEqual(0);
      expect(panel.slice(start, start + 240), method).toContain("demoGuard()");
    }
  });

  it("shows a broker-derived exact prompt before a default-agent handoff", () => {
    const editor = readFileSync(join(repositoryRoot, "components", "DraftEditor.qml"), "utf8");
    expect(editor).not.toContain("suggestedPrompt");
    expect(editor).toContain("EXACT DEFAULT-AGENT PROMPT");
    expect(editor).toContain("prepareDefaultAgentHandoff(request.text)");
    expect(editor).toContain("confirmDefaultAgentHandoff()");
  });

  it("keeps app-rule and template deletion behind typed inline actions", () => {
    const panel = readFileSync(join(repositoryRoot, "Panel.qml"), "utf8");
    const store = readFileSync(join(repositoryRoot, "components", "OmaDigestStore.qml"), "utf8");
    expect(panel).toContain("OmaDigest.InlineDeleteControl");
    expect(panel).toContain("OmaDigest.OmaDigestStore.deletePrivacyRule");
    expect(panel).toContain("OmaDigest.OmaDigestStore.deleteTemplate");
    expect(store).toContain('type: "privacy_delete_rule"');
    expect(store).toContain('type: "template_delete"');
  });
});
