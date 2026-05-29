# Stage2Context Cleanup Report

Date: 2026-05-29

Scope:

- `backend/analyzer.js`
- `buildStage2Context()`

This was a dead-data removal only. No prompt assembly logic, semantic extraction, DirectorBrief generation, PromptComponents generation, ShotPlan generation, PromptSlots generation, or `compressStage2Assembly()` logic was changed.

## Removed Fields

Removed only these nested copies from the object returned by `buildStage2Context()`:

- `director_brief`
- `prompt_components`
- `shot_plan`
- `prompt_slots`

These structures are still generated exactly as before and are still passed separately to downstream prompt assembly.

## Consumer Verification

Before removal, static usage showed:

- `compressStage2Assembly()` reads only these `compactContext` fields:
  - `content_type`
  - `reel_type`
  - `creator_archetype`
  - `reel_energy`
  - `dance_energy`
  - `creator_intent`
  - `pose_rhythm`
  - `camera_style`
  - `primary_object`
  - `hero_element`
  - `overlay_topic`
  - `spoken_topic`
  - `speech_language`
  - `audio_type`
- `buildPlatformPrompt()` also reads `compactContext.speech_language` for the separate `SPEECH_LANGUAGE` section.
- No downstream code reads:
  - `compactContext.director_brief`
  - `compactContext.prompt_components`
  - `compactContext.shot_plan`
  - `compactContext.prompt_slots`

Post-removal check:

```powershell
rg -n "compactContext\.(director_brief|prompt_components|shot_plan|prompt_slots)|director_brief:directorBrief|prompt_components:promptComponents|shot_plan:shotPlan|prompt_slots:promptSlots" backend\analyzer.js
```

Result:

- No references remain inside `buildStage2Context()`.
- One remaining `director_brief: directorBrief` exists in `platformWriter()`, which is unrelated to `compactContext` and was not modified.

## Payload Size

Because these nested structures are runtime-dependent, exact byte counts require a real analysis run. The structural payload reduction is:

| Metric | Before | After |
|---|---:|---:|
| `buildStage2Context()` top-level fields | 63 | 59 |
| Nested copied structures | 4 | 0 |
| Nested DirectorBrief fields copied through context | ~68 | 0 |
| Nested PromptComponents fields copied through context | 11 | 0 |
| Nested ShotPlan fields copied through context | 6 | 0 |
| Nested PromptSlots top-level fields copied through context | 4 | 0 |

Estimated reduction:

- Removes 4 top-level nested object keys.
- Removes duplicated serialization cost for the nested copies when tracing or inspecting `compactContext`.
- Removes up to roughly 89 nested field entries from the `compactContext` object shape, depending on populated runtime values.

Final Stage2 prompt payload:

- Previous final prompt size: unchanged by this cleanup.
- New final prompt size: unchanged by this cleanup.

Reason:

`compressStage2Assembly()` never serialized those nested `compactContext` fields. It receives `directorBrief`, `shotPlan`, and `promptSlots` as separate arguments and creates `minimalContext` from selected scalar fields only.

## Final Prompt Equivalence

Final Stage2 prompt should remain unchanged because:

1. `DIRECTOR_BRIEF:` is still built from the separate `directorBrief` argument.
2. `SHOT_PLAN:` is still built from the separate `shotPlan` argument.
3. `PROMPT_SLOTS:` is still built from the separate `promptSlots` argument.
4. `COMPACT_CONTEXT:` is still built from the same 14 selected scalar `compactContext` fields.
5. The removed nested fields were not among those selected scalar fields.

Generated platform prompts should remain unchanged for the same reason: Gemini receives the same final Stage2 prompt sections as before.

## Verification Commands

Syntax check:

```powershell
node --check backend\analyzer.js
```

Result:

- Passed.

Downstream reference check:

```powershell
rg -n "compactContext\?\." backend\analyzer.js
```

Result:

- Only the 14 scalar fields consumed by `compressStage2Assembly()` remain.

No missing references were found.

## Existing Diagnostics

The existing diagnostics remain intact:

- `[prompt trace]`
- `[prompt pipeline report]`
- `[payload growth report]`
- `[semantic overlap report]`
- `[slot-only diagnostics]`
- `[stage2 final prompt]`
- `[compressed prompt]`

The cleanup only reduces dead data inside `buildStage2Context()` and does not alter what those diagnostics measure downstream.

## Conclusion

This cleanup removed only proven write-only nested copies from `buildStage2Context()`.

No architecture was changed. No prompt text path was changed. No semantic generation path was changed.
