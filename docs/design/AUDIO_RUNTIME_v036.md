# Audio runtime v036.00

Recorded-WAV playback for the scene-audio lane. Parent: PR #31 `2e5677b1abdb02b3de298b8b899ce9091396434c`.

## Pins consumed

- Viseme/timing JSON: `fce5110d89658f0e8c813d74dad7e3ba0e996896` (`docs/master_29_handoff.json`)
- Bounded documentation: `7558638799884aa8974625ad06d6898920de1ee3`

## Owned paths touched

- `apps/web/src/scene/audio.ts`, `audioClips.ts`, `dialogue.ts`, `AgentPyramid.tsx`
- `apps/web/public/art/audio/` (29 WAV masters + handoff copy)
- `docs/design/`
- `tests/scene/`

`scene/index.tsx` is unchanged. Integration wiring for selection cancel and recovery authorization remains the combined-head owner.

## Gates

- Mute by default
- Ordinary clips: `READY` only
- Outage clips: `GRAPH_UNAVAILABLE` only (transcripts match accepted WAV masters, including Guz “will not”)
- Recovery clips (`ava_10_reconnect_check`, `roy_10_ready`): `READY` and `recoveryAuthorized === true` only; Guz has no recovery master
- `cancelSpeech()` stops the active `HTMLAudioElement` (and any leftover `speechSynthesis`)

## Out of scope

- No merge, seed, release, or self-acceptance
- No Buddy integration files, no Cora mount/comet files
- No paid model call; no retake; Roy pacing unchanged
- Headed browser proof on a combined head is for the independent reviewer after Buddy reconciles
