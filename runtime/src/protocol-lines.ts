export const MAX_PROTOCOL_LINE_BYTES = 2 * 1024 * 1024;

export type ProtocolLine =
  | { kind: "line"; value: string }
  | { kind: "too-large" };

export async function* readBoundedProtocolLines(
  input: AsyncIterable<Buffer | Uint8Array | string>,
  maximumBytes = MAX_PROTOCOL_LINE_BYTES
): AsyncGenerator<ProtocolLine> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("A positive protocol-line limit is required");
  let chunks: Buffer[] = [];
  let length = 0;
  let discarding = false;

  for await (const value of input) {
    const chunk = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      const end = newline === -1 ? chunk.length : newline;
      const pieceLength = end - offset;

      if (!discarding && pieceLength > 0) {
        if (length + pieceLength > maximumBytes) {
          chunks = [];
          length = 0;
          discarding = true;
          yield { kind: "too-large" };
        } else {
          chunks.push(Buffer.from(chunk.subarray(offset, end)));
          length += pieceLength;
        }
      }

      if (newline === -1) break;
      if (discarding) discarding = false;
      else {
        const raw = Buffer.concat(chunks, length);
        const content = raw.length > 0 && raw[raw.length - 1] === 0x0d ? raw.subarray(0, -1) : raw;
        yield { kind: "line", value: content.toString("utf8") };
      }
      chunks = [];
      length = 0;
      offset = newline + 1;
    }
  }

  if (!discarding && length > 0) {
    const raw = Buffer.concat(chunks, length);
    const content = raw.length > 0 && raw[raw.length - 1] === 0x0d ? raw.subarray(0, -1) : raw;
    yield { kind: "line", value: content.toString("utf8") };
  }
}
