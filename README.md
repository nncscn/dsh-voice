# DSH ASR Voice

Adds a microphone button to the DeepSeek Harness composer. Press it, speak, press
it again — the transcript is inserted at the cursor.

The plugin is a thin client: it records in the browser and sends the audio to any
speech-to-text endpoint that follows the OpenAI transcription shape. It ships with
no built-in provider and no bundled keys.

## Requirements

- DeepSeek Harness with the Web UI.
- One ASR endpoint, reachable from the browser and allowing CORS. Options:
  - Self-hosted: `transcribe.cpp`, `whisper.cpp --server`, `faster-whisper` + FastAPI,
    vLLM audio, FunASR gateway — anything exposing `POST /v1/audio/transcriptions`.
  - Cloud: OpenAI (`whisper-1`, `gpt-4o-transcribe`), SiliconFlow, DashScope
    compatible mode, and similar OpenAI-compatible services.
  - Azure OpenAI: use the deployment URL including `?api-version=`.

## Install

```bash
dsh plugin add @nncs/dsh-asr-voice
```

or install the bundle `@nncs/dsh-asr-voice` from the plugin manager inside Harness.

## Configure

1. Long-press the microphone button (or press `Shift+Enter` while it is focused)
   to open the settings panel.
2. Fill in the endpoint and, if your service needs one, an API key.
3. Use Test to send a 0.5 s silent probe — it reports auth failures and shows what
   the response parser extracted.

### Endpoint rules

| You type | Request goes to |
| --- | --- |
| `192.168.1.10:8010` | `http://192.168.1.10:8010/v1/audio/transcriptions` |
| `https://api.example.com/v1` | `https://api.example.com/v1/audio/transcriptions` |
| `https://api.example.com/custom/path` | used verbatim |

Azure mode never rewrites the URL — paste the full deployment path.

### Protocols

| Protocol | Request |
| --- | --- |
| OpenAI compatible | `multipart/form-data` + `Authorization: Bearer` |
| Azure OpenAI | `multipart/form-data` + `api-key` |
| JSON + base64 | JSON body `{ audio, language, model }` + `Authorization: Bearer` |

Set Auth header only when a service expects a non-standard header name.

### Response field

Empty means auto-detect: `text`, `result`, `transcript`, `output_text`,
`data.text`, `data.result`, `result.text`, then `segments[].text`. Supply a dot
path such as `data.result.text` if your service uses something else.

## Behaviour

- Records at 16 kHz mono and uploads WAV, so no server-side transcoding is needed.
- Stops automatically at 60 s; clips shorter than 0.4 s are discarded.
- While transcribing, the button shows a spinner; failures turn it red and show a
  short message with the server's own error text.
- Silence is filtered: filler-only results such as a lone "Mm" or "Silence." are
  not inserted, so an accidental click never types anything.
- The transcript is inserted at the caret; if that fails it is copied to the
  clipboard instead.

## Privacy

- Audio never touches the local disk: it lives in memory and is posted once.
- The plugin keeps no transcript history.
- Settings (endpoint, key, language, model) are stored in the browser's
  `localStorage`. Use a dedicated, revocable key and avoid pasting long-lived
  secrets on shared machines.
- The server you point at decides what happens to the audio after upload.

## License

MIT
