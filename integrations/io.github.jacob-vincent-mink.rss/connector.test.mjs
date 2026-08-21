import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEntries, parseFeed, safeFeedUrl } from "./connector.mjs";

const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>tag:example.com,2026:one</id><title>Urgent &amp; safe</title><updated>2026-08-20T10:00:00Z</updated><link rel="alternate" href="https://example.com/post/1#track"/><summary><![CDATA[Service <b>incident</b> details]]></summary></entry>
  <entry><id>old</id><title>Old</title><updated>2020-01-01T00:00:00Z</updated></entry>
</feed>`;

test("parses Atom deterministically and emits keyword matches", () => {
  const entries = parseFeed(feed, new URL("https://example.com/feed.xml"));
  assert.equal(entries[0].title, "Urgent & safe"); assert.equal(entries[0].summary, "Service incident details"); assert.equal(entries[0].link, "https://example.com/post/1");
  const items = normalizeEntries(entries, ["incident"], "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z", 50);
  assert.deepEqual(items.map((item) => item.category), ["new-entries", "priority-keywords"]);
  assert.match(items[0].id, /^rss:entry:[0-9a-f]{32}$/u);
});

test("rejects DTDs, private URLs, credentials, and plaintext", () => {
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>', new URL("https://example.com/feed")), /DTD/u);
  for (const url of ["http://example.com/feed", "https://user:pass@example.com/feed", "https://127.0.0.1/feed", "https://host.local/feed"]) assert.throws(() => safeFeedUrl(url));
});

test("parses RSS items and bounds category schema", async () => {
  const rss = `<rss><channel><item><guid>x</guid><title>Release</title><pubDate>Thu, 20 Aug 2026 12:00:00 GMT</pubDate><link>https://example.com/x</link></item></channel></rss>`;
  assert.equal(parseFeed(rss, new URL("https://example.com/feed"))[0].sourceId, "x");
  const { readFile } = await import("node:fs/promises"); const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8")); assert.equal(manifest.categories.length, 2);
});
