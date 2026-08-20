import { describe, expect, it } from "vitest";
import { normalizeSpeechText, validateSpeechEndpoint } from "../src/tts.js";

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
});
