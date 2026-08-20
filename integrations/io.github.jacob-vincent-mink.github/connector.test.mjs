import test from "node:test";
import assert from "node:assert/strict";
import { apiUrlToWebUrl, parseNotifications } from "./connector.mjs";

test("normalizes bounded GitHub notification metadata", () => {
  const items = parseNotifications([{
    id: "987", reason: "review_requested", updated_at: "2026-08-20T17:30:00Z",
    subject: { title: "Keep QML presentation-only", type: "PullRequest", url: "https://api.github.com/repos/acme/omadigest/pulls/482" },
    repository: { full_name: "acme/omadigest", html_url: "https://github.com/acme/omadigest" }
  }], "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z", 50);

  assert.deepEqual(items, [{
    id: "github:notification:987",
    connector: "io.github.jacob-vincent-mink.github",
    kind: "github-notification",
    occurredAt: "2026-08-20T17:30:00.000Z",
    title: "[acme/omadigest] Keep QML presentation-only",
    body: "Review requested · Pull request",
    url: "https://github.com/acme/omadigest/pull/482",
    sensitivity: "work",
    derivedFrom: ["github:notification:987"]
  }]);
});

test("drops malformed and out-of-window notifications", () => {
  assert.deepEqual(parseNotifications([
    { id: "old", updated_at: "2026-08-01T00:00:00Z", subject: { title: "Old" }, repository: { full_name: "acme/old" } },
    { id: "missing", updated_at: "2026-08-20T10:00:00Z", subject: {}, repository: { full_name: "acme/missing" } }
  ], "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z"), []);
});

test("never forwards an API or credential-bearing URL", () => {
  assert.equal(apiUrlToWebUrl("https://api.github.com/repos/acme/app/releases/1", "https://github.com/acme/app?token=no"), "https://github.com/acme/app");
  assert.equal(apiUrlToWebUrl("https://evil.example/item", "https://evil.example/repo"), undefined);
});
