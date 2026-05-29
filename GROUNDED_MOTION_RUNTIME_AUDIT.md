# GroundedMotion Runtime Consumption Audit

## Summary

`groundedMotion` is operationally dead in the modern compressed Stage 2 prompt path.

It is still active in:

- legacy prompt assembly
- semantic overlap diagnostics
- prompt tracing
- legacy payload size estimation

It does not feed:

- `DirectorBrief`
- `ShotPlan`
- `PromptSlots`
- `Stage2Context`
- retained sections of `compressStage2Assembly()`
- final compressed Stage 2 prompt
- generated platform prompt content
- validation
- benchmarks

## Every Read Of `groundedMotion` / `GROUNDED_MOTION_FACTS`

| File | Location | Read | Path type | Runtime effect |
|---|---|---|---|---|
| `backend/analyzer.js` | `groundedMotionSummary(factual)` | Produces `groundedMotion` from `generateImageMotionFacts(factual)` and raw Stage 1 fields. | Producer | Creates object; no prompt effect by itself. |
| `backend/analyzer.js` | `buildLegacyPlatformPrompt()` | `const groundedMotion = groundedMotionSummary(factual)` | Legacy-only production path | Produces data for legacy prompt text. |
| `backend/analyzer.js` | `buildLegacyPlatformPrompt()` | `GROUNDED_MOTION_FACTS:\n${JSON.stringify(groundedMotion)}` | Legacy-only prompt injection | Directly affects legacy final prompt when the legacy path is used. |
| `backend/analyzer.js` | `buildLegacyPlatformPrompt()` | Motion rule mentions `GROUNDED_MOTION_FACTS` | Legacy-only prompt instruction | Tells the model it may use that section. |
| `backend/analyzer.js` | `buildPlatformPrompt()` | `const groundedMotion = traceStage("groundedMotion", ...)` | Modern diagnostic/tracing path | Captures trace data; does not feed retained prompt content. |
| `backend/analyzer.js` | `buildPlatformPrompt()` | `recordSemanticOverlap("motionFacts", motionFacts, "groundedMotion", groundedMotion)` | Diagnostic-only | Produces overlap report only. |
| `backend/analyzer.js` | `buildPlatformPrompt()` | `recordSemanticOverlap("groundedMotion", groundedMotion, "shotPlan", shotPlan)` | Diagnostic-only | Produces overlap report only. |
| `backend/analyzer.js` | `buildPlatformPrompt()` | `"GROUNDED_MOTION_FACTS", JSON.stringify(groundedMotion)` in `legacyLengthEstimate` | Diagnostic/measurement-only | Affects estimated old payload size and compression reduction percentage, not prompt content. |
| `backend/analyzer.js` | `compressStage2Assembly()` | `"GROUNDED_MOTION_FACTS"` in `removedSections` | Diagnostic/reporting-only | Reports it as removed; does not read the object value. |

## Production Path Classification

### Legacy-Only Path

```text
buildLegacyPlatformPrompt()
  -> groundedMotionSummary()
  -> GROUNDED_MOTION_FACTS section
  -> prompt sent to model
```

This path is active only when:

```js
!promptIntelligenceEnabled() && !isModernVideoPlatform(field)
```

Examples:

- `keyframe` when prompt intelligence is disabled
- other non-modern fields routed through `buildPlatformPrompt()`

For modern video platforms (`veo`, `sora`, `runway`, `kling`, `pika`), `isModernVideoPlatform(field)` forces modern assembly even if prompt intelligence is disabled.

### Modern Production Path

```text
buildPlatformPrompt()
  -> groundedMotion trace stage
  -> semantic overlap reports
  -> legacyLengthEstimate
  -> compressStage2Assembly()
  -> final prompt
```

In this path, `groundedMotion` does not reach the retained final prompt.

## Captured Pipeline Inputs

### DirectorBrief Inputs

Call:

```js
buildDirectorBrief(factual, cameraGrammar, microMotion, shotPlan, stage2Scope)
```

Inputs:

- `factual`
- `cameraGrammar`
- `microMotion`
- `shotPlan`
- `stage2Scope`

Not passed:

- `groundedMotion`
- `GROUNDED_MOTION_FACTS`

Runtime status:

```text
groundedMotion not consumed
```

### ShotPlan Inputs

Call:

```js
buildShotPlan(factual, cameraGrammar, microMotion)
```

Inputs:

- `factual`
- `cameraGrammar`
- `microMotion`

Not passed:

- `groundedMotion`

Runtime status:

```text
groundedMotion not consumed
```

### PromptSlots Inputs

Call:

```js
buildPromptSlots(field, shotPlan, factual, stage2Scope)
```

Inputs:

- `field`
- `shotPlan`
- `factual`
- `stage2Scope`

Not passed:

- `groundedMotion`

Runtime status:

```text
groundedMotion not consumed
```

### Stage2Context Inputs

Call:

```js
buildStage2Context(factual, shotPlan, promptSlots, promptComponents, directorBrief, stage2Scope)
```

Inputs:

- `factual`
- `shotPlan`
- `promptSlots`
- `promptComponents`
- `directorBrief`
- `stage2Scope`

Not passed:

- `groundedMotion`

Runtime status:

```text
groundedMotion not consumed
```

### compressStage2Assembly Retained Sections

Retained:

```js
[
  "PLATFORM_TEMPLATE",
  "PLATFORM_PROFILE",
  "DIRECTOR_BRIEF",
  "AUDIO_GUIDANCE",
  "DIRECTOR_PROMPT",
  "SHOT_PLAN",
  "PROMPT_SLOTS",
  "COMPACT_CONTEXT"
]
```

Removed:

```js
[
  "STAGE_1_FACTS",
  "MOTION_SYNTHESIS",
  "GROUNDED_MOTION_FACTS",
  "MICRO_MOTION_LAYER",
  "duplicate semantic context",
  "repeated validation instructions",
  "long platform examples",
  "full profile metadata"
]
```

Runtime status:

```text
GROUNDED_MOTION_FACTS is explicitly listed as removed.
```

The object value is not included in the final compressed prompt.

## Would Removing GroundedMotion From These Areas Alter Behavior?

### Remove From Semantic Overlap Diagnostics

Affected:

- `[semantic overlap report]`
- `PROMPT_PIPELINE_REPORT.md` style diagnostics

Not affected:

- final Stage2 prompt
- generated platform prompts
- validation
- benchmark outputs

Reason:

`recordSemanticOverlap()` only records diagnostics; no downstream generation reads those reports.

### Remove From `legacyLengthEstimate`

Affected:

- `oldLength`
- `reductionPercent`
- compression diagnostics

Not affected:

- final Stage2 prompt
- generated platform prompts
- validation
- benchmark outputs

Reason:

`legacyLengthEstimate` is passed into `compressStage2Assembly()` only as a number used for logging:

```js
const beforeChars = Number(legacyLengthEstimate) || 0;
```

It does not affect prompt text except compression logs.

### Remove From Prompt Tracing

Affected:

- `activePromptTrace.stages`
- pipeline reports
- payload growth reports

Not affected:

- final Stage2 prompt
- generated platform prompts
- validation
- benchmark outputs

Reason:

The trace stage wraps production of `groundedMotion`, but its result is not passed to retained prompt assembly except diagnostics and legacy length estimate.

## Final Prompt Impact

Modern path:

```text
No final prompt impact.
```

The final compressed prompt is assembled from:

- compact profile
- compact platform template
- director brief
- audio guidance
- director prompt
- shot plan
- prompt slots
- compact context
- speech language
- rules

`groundedMotion` is not in that list.

Legacy path:

```text
Direct prompt impact.
```

In `buildLegacyPlatformPrompt()`, `groundedMotion` is directly injected as `GROUNDED_MOTION_FACTS`.

## Generated Platform Prompt Impact

Modern `veo`, `sora`, `runway`, `kling`, `pika`:

```text
No direct impact expected if removed only from diagnostics, tracing, and legacyLengthEstimate.
```

Legacy/non-modern fields:

```text
Possible impact if removed from buildLegacyPlatformPrompt().
```

Current keyframe note:

`keyframe` can use the legacy path when prompt intelligence is disabled. In that case, removing `GROUNDED_MOTION_FACTS` from legacy prompt text could alter keyframe output.

## Validation Impact

No direct validation impact.

`validatePrompts()` reads:

- final prompt strings
- required prompt fields
- `factual.audio_type`

It does not read:

- `groundedMotion`
- `GROUNDED_MOTION_FACTS`

## Benchmark Impact

No direct benchmark impact.

Benchmark tools store and evaluate:

- `master_prompt`
- `platform_prompt` / `veo_prompt`
- ratings
- notes
- issue tags

They do not read `groundedMotion`.

If generated prompts remain unchanged, benchmark outputs remain unchanged.

## Operational Deadness Finding

For the modern compressed pipeline:

```text
groundedMotion is operationally dead.
```

It is alive only as:

- a diagnostic artifact
- a trace artifact
- an old-length measurement component
- legacy prompt content

## Risk Table

| Removal target | Modern final prompt risk | Generated prompt risk | Validation risk | Diagnostic/report risk | Legacy risk |
|---|---:|---:|---:|---:|---:|
| Remove semantic overlap reads | None | None | None | High | None |
| Remove from `legacyLengthEstimate` | None | None | None | Medium | None |
| Remove trace stage | None | None | None | High | None |
| Remove from `buildLegacyPlatformPrompt()` | None for modern platforms | Possible for legacy/keyframe | None | Low | High |
| Delete `groundedMotionSummary()` entirely | Low for modern path | Possible indirect breakage | None | High | High |

## Conclusion

`GroundedMotion` can be safely considered operationally dead in the modern platform prompt path for `veo`, `sora`, `runway`, `kling`, and `pika`.

Safe next experiment:

1. Keep `groundedMotionSummary()` intact.
2. Stop computing `groundedMotion` in `buildPlatformPrompt()` for modern platforms.
3. Remove only:
   - semantic overlap diagnostics involving `groundedMotion`
   - `GROUNDED_MOTION_FACTS` from `legacyLengthEstimate`
   - `traceStage("groundedMotion", ...)`
4. Do not touch `buildLegacyPlatformPrompt()`.
5. Compare final Stage2 prompts and generated platform prompts.

Expected result:

```text
No generated prompt changes for modern video platforms.
Only diagnostics and payload-growth reports change.
```

No code was modified for this audit.
