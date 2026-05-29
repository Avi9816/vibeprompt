# GroundedMotion Experiment Report

## Summary

Implemented a measurement-only feature flag:

```text
VP_DISABLE_GROUNDED_MOTION=1
```

When enabled, modern video platforms skip `groundedMotion` computation and diagnostics.

Modern platforms:

```json
["veo", "sora", "runway", "kling", "pika"]
```

Legacy and keyframe behavior are preserved.

## Files Modified

| File | Change |
|---|---|
| `backend/analyzer.js` | Added `groundedMotionExperimentEnabled()`. |
| `backend/analyzer.js` | Skips `groundedMotionSummary()` for modern platforms when `VP_DISABLE_GROUNDED_MOTION=1`. |
| `backend/analyzer.js` | Skips `traceStage("groundedMotion")` when the experiment is enabled for modern platforms. |
| `backend/analyzer.js` | Skips semantic overlap diagnostics involving `groundedMotion` when not built. |
| `backend/analyzer.js` | Omits `GROUNDED_MOTION_FACTS` from `legacyLengthEstimate` when not built. |

## Affected Code Paths

### Modern Path

Affected only inside:

```js
buildPlatformPrompt(field, factual, stylePreset, instructions, generationMode)
```

Condition:

```js
groundedMotionExperimentEnabled() && isModernVideoPlatform(field)
```

When true:

```js
const groundedMotion = null;
```

Skipped:

- `groundedMotionSummary(factual)`
- `traceStage("groundedMotion", ...)`
- `recordSemanticOverlap("motionFacts", motionFacts, "groundedMotion", groundedMotion)`
- `recordSemanticOverlap("groundedMotion", groundedMotion, "shotPlan", shotPlan)`
- `GROUNDED_MOTION_FACTS` contribution to `legacyLengthEstimate`

### Legacy Path

Preserved.

`buildLegacyPlatformPrompt()` still computes:

```js
const groundedMotion = groundedMotionSummary(factual);
```

and still injects:

```text
GROUNDED_MOTION_FACTS:
...
```

### Keyframe Path

Preserved.

`keyframe` is not a modern video platform:

```js
isModernVideoPlatform("keyframe") === false
```

Therefore the experiment does not disable keyframe’s legacy `groundedMotion` behavior.

## Diagnostics

Added:

```text
[grounded-motion experiment]
```

Shape:

```json
{
  "enabled": true,
  "platform": "veo",
  "groundedMotionBuilt": false,
  "modernPlatform": true
}
```

When disabled:

```json
{
  "enabled": false,
  "platform": "veo",
  "groundedMotionBuilt": true,
  "modernPlatform": true
}
```

For keyframe:

```json
{
  "enabled": true,
  "platform": "keyframe",
  "groundedMotionBuilt": true,
  "modernPlatform": false
}
```

## Expected Prompt Impact

Expected modern platform prompt impact:

```text
None
```

Reason:

The runtime audit showed `groundedMotion` does not feed:

- `DirectorBrief`
- `ShotPlan`
- `PromptSlots`
- `Stage2Context`
- retained `compressStage2Assembly()` sections
- final Stage2 prompt
- validation

Expected generated prompt impact:

```text
None for veo, sora, runway, kling, pika
```

Expected legacy/keyframe impact:

```text
None
```

because the experiment is gated to modern platforms only.

## Expected Payload Impact

When enabled for modern platforms:

Reduced diagnostic/tracing payload:

- no `groundedMotion` trace stage
- no `groundedMotion` semantic overlap reports
- no `GROUNDED_MOTION_FACTS` contribution inside `legacyLengthEstimate`

Final compressed prompt payload:

```text
No expected change
```

because `GROUNDED_MOTION_FACTS` was already excluded from retained compressed sections.

Compression logs may change:

- `oldLength` may decrease
- `reductionPercent` may change
- payload growth reports may no longer include a grounded motion stage

## Verification

Passed:

```text
node --check backend\analyzer.js
```

## Experiment Boundary

This does not:

- remove `groundedMotionSummary()`
- modify `buildLegacyPlatformPrompt()`
- modify keyframe behavior
- modify validation rules
- modify generated prompt text intentionally
- remove any legacy `GROUNDED_MOTION_FACTS` code

This is a measurement-only experiment.
