#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const scenarios = [
  {
    name: "pull-request-thread",
    items: [
      item("pr-review", "GitHub", "Review requested on PR #184", "alex asked for review in oma-shell", "review", "normal", -12),
      item("pr-ci", "GitHub", "CI failed on PR #184", "qml-check failed in oma-shell", "ci-security", "normal", -8),
      item("pr-mention", "GitHub", "You were mentioned on PR #184", "A maintainer asked whether the UI state is ready", "mentions", "normal", -4)
    ]
  },
  {
    name: "time-sensitive-meeting",
    items: [
      item("meeting-moved", "Calendar", "Design review moved to 11:10", "The meeting begins in 10 minutes and the room changed to Cedar", "timed-events", "critical", -1)
    ]
  },
  {
    name: "low-signal-batch",
    items: [
      item("release-a", "Project Feed", "Library A published 2.4", "Maintenance release notes are available", "updates", "low", -5)
    ]
  },
  {
    name: "history-aware-pr",
    memoryEpisodes: [
      ...Array.from({ length: 100 }, (_, index) => memoryEpisode(
        `noise-${index}`, "evidence", `Routine repository update ${index}`,
        `A low-signal repository update was observed ${Math.floor(index / 2) + 2} days ago.`, `noise-source-${index}`, -(Math.floor(index / 2) + 2) * 1440
      )),
      memoryEpisode("prior-pr-184", "digest", "PR #184 report",
        "PR #184 had the same QML check failure before it recovered without intervention.", "prior-pr-184", -30 * 1440)
    ],
    items: [
      item("pr-repeat", "GitHub", "CI failed on PR #184", "The QML check failed again on the same branch", "ci-security", "normal", -2)
    ],
    expected: { recalledHistory: true }
  },
  {
    name: "jit-context-pack",
    memoryEpisodes: [
      memoryEpisode("prior-pr-184", "digest", "jacob/omadigest PR #184 report",
        "PR #184 previously needed a QML alignment check before review.", "prior-pr-184", -4 * 1440)
    ],
    items: [
      item("design-review", "Calendar", "OmaDigest design review starts in 12 minutes",
        "Review jacob/omadigest PR #184 with the maintainers.", "timed-events", "normal", -1),
      item("review-request", "GitHub", "Review requested on jacob/omadigest PR #184",
        "The integration and attention UI are ready for review.", "reviews", "normal", -3)
    ],
    expected: { outcome: "digest", templateId: "context-pack" }
  },
  {
    name: "standing-policy-compiler",
    policyRequest: "Interrupt me for critical production failures. Keep everything else under the normal attention rules.",
    expected: { outcome: "policy", policyAction: "notify" }
  }
];

function item(id, app, title, body, category, urgency, minutesAgo) {
  return {
    id: `evaluation:${id}`, source: "omadigest.evaluation", app, title, body, category, urgency,
    occurredAt: new Date(Date.now() + minutesAgo * 60_000).toISOString()
  };
}

function memoryEpisode(id, kind, subject, summary, sourceId, minutesAgo) {
  return {
    id: `evaluation-${id}`, kind, occurredAt: new Date(Date.now() + minutesAgo * 60_000).toISOString(),
    subject, summary, sources: [{ id: `evaluation:${sourceId}`, source: "omadigest.evaluation", app: "Evaluation" }],
    ...(kind === "digest" ? { action: "digest", digestId: "67fd16f4-d77f-4782-b2d7-694ef2654c7f" } : {})
  };
}

async function runScenario(scenario) {
  const stateRoot = mkdtempSync(join(tmpdir(), "omadigest-eval-"));
  const configRoot = join(stateRoot, "config");
  const sourceConfigRoot = process.env.XDG_CONFIG_HOME?.startsWith("/")
    ? join(process.env.XDG_CONFIG_HOME, "omadigest")
    : join(process.env.HOME || "", ".config", "omadigest");
  const isolatedConfigRoot = join(configRoot, "omadigest");
  mkdirSync(isolatedConfigRoot, { recursive: true, mode: 0o700 });
  for (const name of ["auth.json", "agent.json", "models.json", "models-store.json"]) {
    const source = join(sourceConfigRoot, name);
    if (existsSync(source)) copyFileSync(source, join(isolatedConfigRoot, name));
  }
  if (scenario.memoryEpisodes?.length) {
    const memoryRoot = join(stateRoot, "omadigest");
    mkdirSync(memoryRoot, { recursive: true, mode: 0o700 });
    writeFileSync(join(memoryRoot, "attention-memory.json"), `${JSON.stringify({
      version: 1, episodes: scenario.memoryEpisodes.slice(0, 512)
    })}\n`, { mode: 0o600 });
  }
  const startedAt = Date.now();
  const child = spawn(process.execPath, [resolve("runtime/dist/omadigest-broker.mjs")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configRoot,
      XDG_STATE_HOME: stateRoot,
      XDG_RUNTIME_DIR: join(stateRoot, "runtime"),
      OMADIGEST_PLUGIN_DIR: process.cwd(),
      OMADIGEST_DISABLE_SOURCE_SYNC: "1",
      OMADIGEST_DISABLE_AUTOMATIC_ATTENTION: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const events = [];
  let stderr = "";
  let sawNotify = false;
  let compiledPolicies = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-8_000); });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  child.stdin.write(`${JSON.stringify({ type: "initialize", protocolVersion: 2 })}\n`);
  let result;
  try {
    result = await new Promise((resolveResult, rejectResult) => {
      const timeout = setTimeout(() => rejectResult(new Error(
        `${scenario.name} timed out after: ${events.filter((event) => event.type === "attention_activity").map((event) => event.activity?.state).join(" → ")}`
      )), 75_000);
      lines.on("line", (line) => {
        let event;
        try { event = JSON.parse(line); } catch { return; }
        events.push(event);
        if (event.type === "attention_activity")
          process.stderr.write(`  ${event.activity?.state}: ${event.activity?.message}\n`);
        if (event.type === "ready") {
          if (scenario.policyRequest) {
            child.stdin.write(`${JSON.stringify({
              type: "attention_policy_create", id: `eval-policy-${scenario.name}`, request: scenario.policyRequest
            })}\n`);
          } else {
            child.stdin.write(`${JSON.stringify({ type: "attention_ingest", id: `eval-ingest-${scenario.name}`, items: scenario.items })}\n`);
            child.stdin.write(`${JSON.stringify({
              type: "attention_wake", id: `eval-wake-${scenario.name}`,
              reason: "scheduled", focusMinutes: 0, minimumItems: 3
            })}\n`);
          }
        }
        if (event.type === "attention_policies") compiledPolicies = event.policies || [];
        if (event.type === "attention_activity" && event.activity?.state === "notifying") sawNotify = true;
        const outcome = event.type === "attention_policy_state" && event.state === "saved" ? "policy"
          : event.type === "digest" ? "digest"
          : event.type === "attention_activity" && event.activity?.state === "holding" ? "hold"
          : sawNotify && event.type === "attention_activity" && event.activity?.state === "observing" ? "notify"
          : event.type === "error" || (event.type === "attention_activity" && event.activity?.state === "error") ? "error" : "";
        if (outcome !== "") {
          clearTimeout(timeout);
          resolveResult({
            scenario: scenario.name,
            outcome,
            elapsedMs: Date.now() - startedAt,
            activity: events.filter((candidate) => candidate.type === "attention_activity")
              .map((candidate) => candidate.activity?.message).filter(Boolean),
            ...(event.digest?.title ? { digestTitle: event.digest.title } : {}),
            ...(event.digest?.templateId ? { templateId: event.digest.templateId } : {}),
            ...(outcome === "policy" && compiledPolicies[0] ? {
              policyName: compiledPolicies[0].name,
              policyAction: compiledPolicies[0].action,
              policyMatch: compiledPolicies[0].match
            } : {}),
            recalledHistory: events.some((candidate) => candidate.type === "attention_activity"
              && String(candidate.activity?.message || "").includes("Recalling related attention history")),
            ...(outcome === "hold" ? {
              heldCount: Number(event.activity?.heldCount || 0),
              nextCheckAt: String(event.activity?.nextCheckAt || "")
            } : {}),
            ...(outcome === "error" ? { error: event.message || event.activity?.message || stderr.trim() } : {})
          });
        }
      });
      child.once("error", rejectResult);
      child.once("exit", (code) => {
        if (code !== 0) rejectResult(new Error(`${scenario.name} broker exited ${code}: ${stderr.trim()}`));
      });
    });
  } finally {
    try { child.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`); } catch { child.kill("SIGTERM"); }
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 1_000))
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(stateRoot, { recursive: true, force: true });
  }
  return result;
}

const results = [];
const requested = process.argv[2];
for (const scenario of requested ? scenarios.filter((candidate) => candidate.name === requested) : scenarios) {
  process.stderr.write(`Evaluating ${scenario.name}…\n`);
  const result = await runScenario(scenario);
  for (const [key, expected] of Object.entries(scenario.expected || {})) {
    if (result[key] !== expected)
      throw new Error(`${scenario.name} expected ${key}=${JSON.stringify(expected)}, received ${JSON.stringify(result[key])}`);
  }
  results.push(result);
}
process.stdout.write(`${JSON.stringify({ evaluatedAt: new Date().toISOString(), results }, null, 2)}\n`);
