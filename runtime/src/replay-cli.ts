import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { attentionReplayFixtureSchema, scoreAttentionReplay, type AttentionReplayFixture } from "./attention-replay.js";

const MAX_FIXTURE_BYTES = 1024 * 1024;
const path = process.argv[2];
const fixture = path === undefined ? sampleFixture() : loadFixture(path);
process.stdout.write(`${JSON.stringify(scoreAttentionReplay(fixture), null, 2)}\n`);

function loadFixture(value: string): AttentionReplayFixture {
  const path = resolve(value);
  if (statSync(path).size > MAX_FIXTURE_BYTES) throw new Error("Replay fixture is too large");
  return attentionReplayFixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function sampleFixture(): AttentionReplayFixture {
  const at = "2026-08-23T12:00:00.000Z";
  return {
    name: "cross-source-pr-and-meeting",
    items: [
      item("gh-184", "github", "GitHub", "Review jacob/omadigest PR #184", "Review requested", "normal", at),
      item("ci-184", "ci", "Buildkite", "CI failed on jacob/omadigest PR #184", "One required check failed", "critical", at),
      item("meeting", "notifications", "Calendar", "Design review starts in 15 minutes", "Bring the PR status", "normal", at)
    ],
    decisions: [{ at, action: "digest", sourceIds: ["gh-184", "ci-184", "meeting"], modelCall: true }]
  };
}

function item(
  id: string, source: string, app: string, title: string, body: string,
  urgency: "low" | "normal" | "critical", occurredAt: string
) {
  return { id, source, app, title, body, urgency, occurredAt, contentAvailable: true };
}
