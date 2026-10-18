# Local browser read-aloud — v053

This slice implements the chosen live-answer speech path: browser/device synthesis
for a current generated text explanation, plus existing accepted WAVs for prepared
character lines. It introduces no ElevenLabs API, new key, model selection, package,
root version or lockfile change. Its parent is frozen PR #61 at
`ec1fae2d58919ce1b0bb44e907ecc3f88a6f8fd0`; that parent's independent/live-provider
gates still apply. This document is an author handoff, not independent acceptance.

## Reuse and boundary

Gem's approved standalone `a3c51fd27e76483e28f189c5e8003ed27704fa78` contains
`speakPhrase` using `SpeechSynthesisUtterance` and `speechSynthesis.speak`. This
slice reuses that browser mechanism, while keeping the mounted app's stricter
current-result, mute, cancellation and recorded-audio ownership rules. It does not
copy the standalone's timed viseme fallback or report speech when no voice exists.
It preserves punctuation rather than removing quotes/apostrophes from evidence.
No new mouth animation or facial lip-sync is claimed.

## Recording-machine flow

1. Configure and independently verify a current graph-backed model explanation as
   described in [v052 setup](talker-v052.md). No speech runs on answer arrival.
2. Unmute using the existing scene audio control, with a real browser gesture.
3. Obtain the explanation. Under its text, choose a **Device voice** from voices
   the browser marks `localService=true`.
4. Click **Read aloud**. This speaks exactly the displayed explanation using that
   local device voice, at normal rate/pitch. It is not one of the selected
   ElevenLabs character voices. Available voices/names vary by OS and browser.
5. **Stop reading**, scene mute, owning-agent close, new explanation/persona,
   route departure, refresh generation or unavailable graph cancels the reading.

Only local-service voices are offered. If none exist or the selected voice has
disappeared, the app leaves text available and shows an honest unavailable message;
it does not fall back to a remote speech service. Voices can arrive asynchronously
through the native `voiceschanged` event. No remote audio generation request is
made by this implementation. Sound from a real device remains a human check.

## Shared audio ownership

The existing global mute remains the single audio gate. A new subscription lets
the text panel reflect it without an independent unmute setting. Read-aloud
requires READY, unmuted audio, a present local voice, bounded nonempty text and
active transient user activation. A caller cannot start it automatically after
waiting for a model response.

Starting speech first stops the current WAV. Starting an accepted WAV stops speech.
Old stop handles and late native completion/error callbacks cannot cancel or
complete a newer reading. Closing another agent does not interrupt the owner.
Phase gating stops speech even if there is no active WAV. The text panel owns its
read handle and stops it on unmount. Browser speech is a separate optional action,
not an ungated fallback in `speakAuthorizedPhrase` or the deprecated `speakPhrase`.
All 29 recorded files and their existing phase/recovery gates are unchanged.

## Verification

```sh
npm ci
npm run verify
npx tsc -p tests/web/tsconfig.json --noEmit
git diff --check
```

New `tests/web/read-aloud-v053.test.ts` uses offline synthesis/audio doubles to
cover activation/mute/phase refusal, local-only selection, text preservation,
mute subscription and stop, sibling/owner cancellation, stale handles, native
completion and WAV preemption. This is not audible output or browser proof.

An additional author JSDOM/actual React `createRoot`/`act` + StrictMode probe with
synthetic network and speech doubles exercised the real panel: current answer
enables the voice control, explicit read uses that text, mute stops and resets the
control, subsequent read works, and a new shell generation unmounts/stops reading.
It also retains v052's late-result/outage/READY checks. No real local voice or
live OpenRouter completion was available to this author environment.

Independent review must inspect the exact head, reproduce regressions and run
actual browser clicks on a host with a real local voice. Check audio mute,
read/stop, closing an agent, WAV/read preemption, refresh/route/outage cancellation,
and no speech upon answer arrival. Check the chosen recording machine audibly;
headless events or waveform placeholders do not prove human-hearable speech.

This slice does not establish its parent model's provider quality/availability,
complete art parity, dynamic ElevenLabs generation, persistent memory, Cloud
connectivity, deployment or release. Do not move PR #61 while it is under review;
this is a separate branch/delta to compose after the required independent checks.

Official browser references:
[SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis),
[localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService).
