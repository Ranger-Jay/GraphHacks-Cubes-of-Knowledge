# Scripted dialogue audio batch (candidate v027)

Generate the approved 27 Roy/Ava/Guz clips with Node 22/24 and the native ElevenLabs HTTP API. This is local/server asset tooling, not a browser endpoint or a live voice conversation implementation. Default execution is an offline plan. No key or paid call was used to validate this candidate.

## Jay's recording settings

Start by selecting one distinct voice per character and auditioning the three original outage lines. Suggested starting settings, not locked creative choices: Eleven Multilingual v2, stability 50%, similarity 75%, style 0%, speaker boost on. Keep settings consistent per character after the audition. If the UI shows additional controls, retain its default and record it for reconciliation. A model/voice setting change may change delivery; the API seed is not a guarantee of identical audio.

The committed transcript preserves the approved original wording. Cora's neutral outage-copy proposal and the two recovery proposals are not included. Original Roy/Ava disconnect wording is appropriate only for a confirmed disconnect trigger; a generic query failure needs truthful neutral presentation instead. Do not silently rewrite text to correct pronunciation. Use a pronunciation dictionary if required, then record its ID/version in the private local config.

## Offline plan

From the repository root:

```sh
node scripts/audio/generate-dialogue.mjs --plan
node scripts/audio/generate-dialogue.mjs --plan --scope all
node --test tests/audio-batch/*.test.mjs
```

Plan prints filenames, exact text, clip/character count and whether voices are configured. It reads no secret, writes nothing and makes no network request. Outage is the default scope (3 files); all is 27 files. Recovery lines remain excluded pending approval.

## Configure locally

Copy `scripts/audio/voices.example.json` to `.local/voices-v001.json` and fill in the chosen voice IDs. That config pattern and the default `.local/agent-dialogue/` output are ignored. The config has no API key. Set `ELEVENLABS_API_KEY` through an existing local/server secret configuration, not a command pasted into chat or a committed file. OpenRouter and ElevenLabs use different keys and balances. Node can load a protected local env file using `--env-file`; never use `VITE_` for either key. If you override `--out`, choose a private path outside the repository or explicitly ignore it first.

Keep `modelId` and the shared voice settings for the first batch. If Jay auditions different settings per character, extend the config/tool explicitly before generating; this candidate currently uses one shared settings object for all three voices. Optional pronunciation dictionary locators use the documented `pronunciation_dictionary_id` and `version_id` fields.

Inspect the offline plan using the configured voices before generating. MP3 44.1 kHz/128 kbps is the initial format; keep the `.mp3` extension. WAV/PCM plan availability varies, and this script does not upgrade an account or request those formats.

## Explicit generation (uses ElevenLabs credits)

Only run after voice/settings and use of the account's credits are authorized. Supply a character ceiling based on the printed plan; the ceiling bounds one invocation's submitted text, not a dollar amount or a provider-side account cap. No automatic purchase, retry or expensive model fallback occurs.

```sh
node scripts/audio/generate-dialogue.mjs --generate --config .local/voices-v001.json --max-characters 300
```

For all clips use `--scope all` and the corresponding ceiling from its plan. The tool refuses missing voices/key or a too-small ceiling before calling the provider. It uses sequential POSTs to the fixed ElevenLabs host, with a timeout and redirects disabled. Do not run a second tool against the same key/output concurrently.

Each MP3 gets a JSON receipt with exact transcript, voice/model/settings, file SHA-256, byte count, optional provider request ID and `playbackVerified:false`. The receipt excludes the API key. A successful HTTP/MP3-format check is not a listening or pronunciation check. Jay must audition the actual clips; no decoder/timing/lip-sync proof is claimed. Existing matching outputs are hash-verified and skipped. Different settings require a new reviewed asset version, not overwriting the original output.

## Interrupted generation

An exclusive directory lock and per-clip attempt file are written before calls. Any failure retains the lock and attempt: a network timeout may already have consumed credits. Inspect ElevenLabs request/history records and local receipts before recovering. Never automatically delete a pending marker and resend. After verified recovery, an operator may remove the lock; unresolved attempt files still block resubmission. Completed clips with matching receipts can be resumed without regenerating them. This is a local duplicate-call guard, not provider idempotency or a hard financial cap.

Upload approved audio and receipts to the requested hackathon Drive folder, and post the links on the recording task. Do not upload local env files. Runtime playback wiring remains a separate integration step with current-phase guards and stale-audio cancellation; this batch tool does not modify the scene or prove live TTS works.

Official API reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert . The candidate needs independent review before integration. The offline suite uses synthetic response bytes and never calls ElevenLabs.
