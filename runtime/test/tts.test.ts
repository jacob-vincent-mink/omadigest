import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeSpeechText, validateSpeechEndpoint, writeBoundedAudioResponse } from "../src/tts.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("read mode policy", () => {
  it("removes code, links, and markdown before remote synthesis", () => {
    expect(normalizeSpeechText("# Update\n[Open issue](https://example.com/x) `code`\n```sh\nrm -rf /\n```"))
      .toBe("Update Open issue code Code block omitted.");
  });

  it("allows HTTPS and loopback HTTP", () => {
    expect(validateSpeechEndpoint("https://api.openai.com/v1").hostname).toBe("api.openai.com");
    expect(validateSpeechEndpoint("http://127.0.0.1:8000/v1").port).toBe("8000");
  });

  it("rejects remote HTTP and URL credentials", () => {
    expect(() => validateSpeechEndpoint("http://example.com/v1")).toThrow(/HTTPS/);
    expect(() => validateSpeechEndpoint("https://user:pass@example.com/v1")).toThrow(/credentials/);
  });

  it("streams valid audio into a private bounded file", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-tts-"));
    roots.push(root);
    const path = join(root, "speech.mp3");
    const response = new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-type": "audio/mpeg" } });
    await expect(writeBoundedAudioResponse(response, path, 8)).resolves.toBe(4);
    expect([...readFileSync(path)]).toEqual([1, 2, 3, 4]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("rejects an excessive declared length before consuming the body", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-tts-"));
    roots.push(root);
    const path = join(root, "speech.mp3");
    const response = new Response(new Uint8Array([1]), {
      headers: { "content-type": "audio/mpeg", "content-length": "9" }
    });
    await expect(writeBoundedAudioResponse(response, path, 8)).rejects.toThrow(/too much audio/);
    expect(() => readFileSync(path)).toThrow();
  });

  it("aborts a chunked response at the byte cap and removes the partial file", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-tts-"));
    roots.push(root);
    const path = join(root, "speech.mp3");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
        controller.enqueue(new Uint8Array([6, 7, 8, 9, 10]));
        controller.close();
      }
    });
    const response = new Response(body, { headers: { "content-type": "audio/mpeg" } });
    await expect(writeBoundedAudioResponse(response, path, 8)).rejects.toThrow(/too much audio/);
    expect(() => readFileSync(path)).toThrow();
  });

  it("rejects non-audio provider responses", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-tts-"));
    roots.push(root);
    const path = join(root, "speech.mp3");
    const response = new Response("provider error", { headers: { "content-type": "text/html" } });
    await expect(writeBoundedAudioResponse(response, path, 64)).rejects.toThrow(/unsupported media type/);
    expect(() => readFileSync(path)).toThrow();
  });
});
