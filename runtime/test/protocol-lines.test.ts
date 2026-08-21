import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readBoundedProtocolLines } from "../src/protocol-lines.js";

async function collect(chunks: Array<string | Buffer>, maximumBytes: number) {
  const records = [];
  for await (const record of readBoundedProtocolLines(Readable.from(chunks), maximumBytes)) records.push(record);
  return records;
}

describe("bounded broker protocol lines", () => {
  it("parses split LF and CRLF records", async () => {
    await expect(collect(["one\r", "\nt", "wo\n"], 16)).resolves.toEqual([
      { kind: "line", value: "one" },
      { kind: "line", value: "two" }
    ]);
  });

  it("discards an oversized line without retaining it and recovers at the next newline", async () => {
    await expect(collect(["12345", "67890", "\nvalid\n"], 8)).resolves.toEqual([
      { kind: "too-large" },
      { kind: "line", value: "valid" }
    ]);
  });

  it("measures UTF-8 bytes rather than JavaScript characters", async () => {
    await expect(collect(["💜💜\nok\n"], 7)).resolves.toEqual([
      { kind: "too-large" },
      { kind: "line", value: "ok" }
    ]);
  });
});
