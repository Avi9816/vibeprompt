# Camera Deduplication Experiment

## Goal

Add a feature-flagged experiment to avoid serializing duplicate camera style data in the final Stage 2 prompt assembly.

Flag:

```txt
VP_DEDUP_CAMERA_STYLE=1
```

## Files Modified

- `backend/analyzer.js`

## Scope

The experiment only affects final Stage 2 assembly serialization inside `compressStage2Assembly()`.

No changes were made to:

- `generateCameraLanguage()`
- `deriveSocialCameraIntelligence()`
- `buildShotPlan()`
- `buildPromptSlots()`
- camera extraction
- shot plan generation
- prompt slot generation
- validation rules
- prompt refinement
- prompt optimization

## Behavior

When the flag is disabled:

```txt
VP_DEDUP_CAMERA_STYLE unset or 0
```

Behavior is unchanged. `COMPACT_CONTEXT.camera_style` is serialized exactly as before.

When the flag is enabled:

```txt
VP_DEDUP_CAMERA_STYLE=1
```

The final Stage 2 assembly compares:

- `DIRECTOR_BRIEF.camera`
- `COMPACT_CONTEXT.camera_style`

If both are non-empty and exactly identical, `COMPACT_CONTEXT.camera_style` is removed before `COMPACT_CONTEXT` is serialized.

If the values differ, `COMPACT_CONTEXT.camera_style` is preserved.

## Diagnostic Log

Added:

```txt
[camera dedup experiment]
{
  "enabled": true,
  "briefCamera": "intimate vertical creator framing",
  "compactCameraStyle": "intimate vertical creator framing",
  "removed": true
}
```

When the values differ:

```txt
[camera dedup experiment]
{
  "enabled": true,
  "briefCamera": "Close vertical social-media framing with subtle phone-camera realism",
  "compactCameraStyle": "intimate vertical creator framing",
  "removed": false
}
```

When disabled:

```txt
[camera dedup experiment]
{
  "enabled": false,
  "briefCamera": "intimate vertical creator framing",
  "compactCameraStyle": "intimate vertical creator framing",
  "removed": false
}
```

## Comparison Points

Use existing logs to compare runs with the flag disabled and enabled.

### Stage2 Prompt Length

Use:

```txt
[compressed prompt]
{
  "platform": "veo",
  "oldLength": 18000,
  "newLength": 2600,
  "reductionPercent": 86
}
```

Expected change:

- Only when duplicate camera style is removed.
- Expected reduction is small, usually the serialized size of one `camera_style` entry.

### Generated Platform Prompts

Compare generated prompt output for:

- `veo`
- `sora`
- `runway`
- `kling`
- `pika`

Expected:

- No intentional prompt behavior change.
- Any change should be limited to Gemini receiving one fewer duplicate camera hint.

### Validation Results

Use existing validation diagnostics:

```txt
[prompt validation details]
```

Expected:

- No validation rule changes.
- Required video platforms remain unchanged.
- Camera validation should still pass because `DIRECTOR_BRIEF.camera`, `SHOT_PLAN.camera_behavior`, and `PROMPT_SLOTS.CAMERA_BEHAVIOR` remain present.

### Prompt Quality Scores

Use existing quality logs:

```txt
[prompt quality]
[platform alignment]
[prompt evaluation]
```

Expected:

- No quality score regression expected.
- If a platform relies heavily on repeated camera reinforcement, this experiment will reveal that through score or prompt-output differences.

## Compatibility Impact

API response shape is unchanged.

The experiment does not remove:

- `factual.camera_style`
- `directorBrief.camera`
- `shotPlan.camera_behavior`
- `promptSlots.CAMERA_BEHAVIOR`
- `compactContext.camera_style` construction

It only conditionally omits the duplicate serialized copy from final Stage 2 prompt text.

## Expected Runtime Behavior

Disabled:

- Final Stage 2 prompt remains identical to prior behavior.

Enabled with duplicate:

- `COMPACT_CONTEXT.camera_style` is omitted.
- `DIRECTOR_BRIEF.camera` remains.
- Stage 2 prompt becomes slightly shorter.

Enabled without duplicate:

- `COMPACT_CONTEXT.camera_style` remains.
- Behavior is preserved.

## Recommended Test Matrix

Run each sample twice:

```txt
VP_DEDUP_CAMERA_STYLE=0
VP_DEDUP_CAMERA_STYLE=1
```

Compare:

- Stage2 prompt length
- Generated platform prompt text
- Validation diagnostics
- Prompt quality and platform alignment logs

Suggested samples:

- creator talking-head reel
- fashion/beauty creator reel
- product reel
- food reel
- static image post

## Risk Assessment

Risk: low-to-medium.

Reason:

- The removed value is only removed when it exactly duplicates `DIRECTOR_BRIEF.camera`.
- Slot-level camera instructions remain untouched.
- Shot plan camera behavior remains untouched.
- Camera grammar remains untouched.

The main risk is reduced reinforcement inside Gemini prompt context, not loss of factual camera information.

