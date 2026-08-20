# Voice and read mode

## Dictation

OmaDigest uses Voxtype rather than owning a microphone stack.

The broker starts external recording with a private transcript path and disables auto-submit and smart auto-submit. Stopping recording waits for Voxtype to write a bounded transcript, then removes the file. The transcript is appended to the active template/integration drafting editor for review.

If Voxtype is unavailable, the microphone control is disabled. Dictation does not broaden the drafting session's scope.

## Out-of-scope handoff

The drafting model cannot answer unrelated requests. It may emit an `out_of_scope` proposal containing a short explanation and suggested prompt. The UI offers **Open in default agent**. Only that explicit click runs:

```bash
omarchy agent prompt "<reviewed prompt>"
```

OmaDigest does not silently hand work to another agent.

## Text-to-speech compatibility

There is no single API implemented by every model server. OmaDigest therefore uses an internal provider adapter and starts with two external contracts:

1. **OpenAI-compatible speech:** `POST /v1/audio/speech`. This works with OpenAI and local/hosted servers that deliberately implement that endpoint.
2. **ElevenLabs native:** `POST /v1/text-to-speech/{voice_id}`.

Ollama's chat/generate API is not treated as speech. vLLM or another local server is compatible only when the deployed server/model exposes the OpenAI speech route. Future adapters can add Piper or another local command without changing the panel contract.

## Playback

The broker:

1. converts the structured digest into presentation text;
2. strips URLs, Markdown markers, and code blocks;
3. caps input at 20,000 characters;
4. requests MP3 audio;
5. rejects empty or over-50-MiB responses;
6. writes a private temporary file;
7. plays through `mpv`;
8. supports pause/resume and stop;
9. removes the file when playback exits.

TTS credentials live in Secret Service. The endpoint/model/voice configuration is ordinary mode-`0600` state. HTTP is accepted only for loopback endpoints; remote endpoints require HTTPS and cannot contain URL credentials, query parameters, or fragments.
