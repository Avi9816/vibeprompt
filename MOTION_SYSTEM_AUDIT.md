# MotionFacts vs GroundedMotion Audit

## Summary

The semantic overlap diagnostics are accurate: `motionFacts` and `groundedMotion` are highly redundant.

`groundedMotion` is built directly from `motionFacts`:

```js
function groundedMotionSummary(factual) {
  const motionFacts = generateImageMotionFacts(factual);
  return {
    subject_motion: motionFacts.subjectMotion,
    visible_motion_cues: cleanFact(factual?.visible_motion_cues) || "none visible",
    inferred_motion: cleanFact(factual?.inferred_motion) || "not enough evidence",
    camera_motion: motionFacts.cameraMotion,
    environmental_motion: motionFacts.environmentalMotion,
  };
}
```

The only unique additions in `groundedMotion` are:

- `visible_motion_cues`
- `inferred_motion`

Everything else is renamed from `motionFacts`.

## Producers

### `motionFacts`

| File | Function | Output fields | Notes |
|---|---|---|---|
| `backend/analyzer.js` | `generateImageMotionFacts(factual)` | `subjectMotion`, `environmentalMotion`, `cameraMotion` | Synthesizes normalized motion language from Stage 1 motion fields and fallback visual evidence. |

Producer behavior:

1. Prefer explicit Stage 1 fields:
   - `subject_motion`
   - `visible_motion_cues`
   - `inferred_motion`
   - `camera_motion`
   - `environmental_motion`
2. If no motion evidence exists, returns static composition language.
3. If evidence is weak/partial, can synthesize subtle motion language from face, pose, hair, clothing, lighting, and environment.

### `groundedMotion`

| File | Function | Output fields | Notes |
|---|---|---|---|
| `backend/analyzer.js` | `groundedMotionSummary(factual)` | `subject_motion`, `visible_motion_cues`, `inferred_motion`, `camera_motion`, `environmental_motion` | Wraps `motionFacts` and adds raw Stage 1 `visible_motion_cues` and `inferred_motion`. |

Producer behavior:

1. Calls `generateImageMotionFacts(factual)`.
2. Renames:
   - `subjectMotion` → `subject_motion`
   - `cameraMotion` → `camera_motion`
   - `environmentalMotion` → `environmental_motion`
3. Adds:
   - raw `visible_motion_cues`
   - raw `inferred_motion`

## Call Chain

### Legacy / Generic Stage 2 Path

```text
s2Prompt()
  -> generateImageMotionFacts()
  -> injects MOTION_SYNTHESIS
```

```text
buildLegacyPlatformPrompt()
  -> generateImageMotionFacts()
  -> groundedMotionSummary()
  -> injects MOTION_SYNTHESIS
  -> injects GROUNDED_MOTION_FACTS
```

### Modern Platform Path

```text
buildPlatformPrompt()
  -> traceStage("motionFacts", generateImageMotionFacts)
  -> traceStage("groundedMotion", groundedMotionSummary)
  -> recordSemanticOverlap("motionFacts", "groundedMotion")
  -> legacyLengthEstimate includes both sections
  -> compressStage2Assembly()
     -> removes MOTION_SYNTHESIS
     -> removes GROUNDED_MOTION_FACTS
```

### Shared Video Fields

```text
generateVideoPromptsByPlatform()
  -> buildVideoPromptSharedFields()
     -> generateImageMotionFacts()
     -> calculateMotionScore()
     -> prompts.motion_score
     -> prompts.environmental_motion
```

## Dependency Graph

```text
Stage1 factual motion fields
  ├─ subject_motion
  ├─ visible_motion_cues
  ├─ inferred_motion
  ├─ camera_motion
  └─ environmental_motion

generateImageMotionFacts()
  ├─ subjectMotion
  ├─ environmentalMotion
  └─ cameraMotion
       │
       ├─ buildVideoPromptSharedFields()
       │    ├─ motion_score
       │    ├─ environmental_motion
       │    └─ style/camera shared fields
       │
       ├─ s2Prompt() legacy MOTION_SYNTHESIS
       │
       ├─ buildLegacyPlatformPrompt() MOTION_SYNTHESIS
       │
       └─ groundedMotionSummary()
            ├─ subject_motion
            ├─ visible_motion_cues
            ├─ inferred_motion
            ├─ camera_motion
            └─ environmental_motion
                 │
                 └─ buildLegacyPlatformPrompt() GROUNDED_MOTION_FACTS
```

## Consumer Matrix

| Consumer | Reads `motionFacts`? | Reads `groundedMotion`? | Purpose |
|---|---:|---:|---|
| `s2Prompt()` | Yes | No | Legacy all-in-one prompt includes `MOTION_SYNTHESIS`. |
| `buildLegacyPlatformPrompt()` | Yes | Yes | Legacy per-platform prompt includes both `MOTION_SYNTHESIS` and `GROUNDED_MOTION_FACTS`. |
| `buildPlatformPrompt()` modern path | Yes | Yes | Creates trace stages and semantic overlap diagnostics; adds both to legacy length estimate. |
| `recordSemanticOverlap()` | Yes | Yes | Diagnostics only. |
| `compressStage2Assembly()` | Indirect only | Indirect only | Lists both under `removedSections`; does not consume their values. |
| `buildVideoPromptSharedFields()` | Yes | No | Uses `motionFacts` to compute `motion_score` and `environmental_motion`. |
| `buildDirectorBrief()` | No | No | Uses `factual`, `microMotion`, `shotPlan`, `cameraGrammar`, not these objects. |
| `buildShotPlan()` | No | No | Uses `factual`, `cameraGrammar`, `microMotion`. |
| `buildPromptSlots()` | No | No | Uses `shotPlan`, `factual`, `stage2Scope`. |
| `buildStage2Context()` | No | No | Uses `factual`, `shotPlan`, `promptSlots`, `directorBrief`, not motionFacts/groundedMotion. |
| `validatePrompts()` | No | No | Validates final prompt strings and shared fields, not internal motion objects. |

## Field Overlap Analysis

| Concept | `motionFacts` field | `groundedMotion` field | Relationship |
|---|---|---|---|
| Subject motion | `subjectMotion` | `subject_motion` | Exact duplicate with naming change. |
| Camera motion | `cameraMotion` | `camera_motion` | Exact duplicate with naming change. |
| Environmental motion | `environmentalMotion` | `environmental_motion` | Exact duplicate with naming change. |
| Visible motion cues | Not included | `visible_motion_cues` | Unique to `groundedMotion`, copied from Stage 1. |
| Inferred motion | Not included | `inferred_motion` | Unique to `groundedMotion`, copied from Stage 1. |

## Unique Contributions

### Unique to `motionFacts`

`motionFacts` is the canonical normalizer/synthesizer.

Unique value:

- Converts weak or absent Stage 1 motion into normalized motion strings.
- Provides camelCase fields used by `calculateMotionScore()`.
- Powers `buildVideoPromptSharedFields()`:
  - `motion_score`
  - `environmental_motion`
- Feeds older prompt schemas.

### Unique to `groundedMotion`

`groundedMotion` adds raw Stage 1 motion evidence:

- `visible_motion_cues`
- `inferred_motion`

Unique value:

- Gives prompts both normalized motion and raw evidence in one object.
- Useful in legacy prompts where the model sees `GROUNDED_MOTION_FACTS`.
- Useful for diagnostics because it compares synthesized motion against source cues.

## Effects on Major Systems

### DirectorBrief

Current dependency:

```text
No direct dependency.
```

`buildDirectorBrief()` uses:

- `factual`
- `cameraGrammar`
- `microMotion`
- `shotPlan`
- `stage2Scope`

It does not read `motionFacts` or `groundedMotion`.

Effect of removal:

- Removing either object from modern prompt assembly would not directly affect `DirectorBrief`.
- Removing `motionFacts` function entirely would affect other systems, especially `buildVideoPromptSharedFields()`.

### ShotPlan

Current dependency:

```text
No direct dependency.
```

`buildShotPlan()` uses:

- `factual.subject_motion`
- `factual.visible_motion_cues`
- `factual.pose_action`
- `factual.environmental_motion`
- `cameraGrammar`
- `microMotion`

It does not read `motionFacts` or `groundedMotion`.

Effect of removal:

- No direct modern `ShotPlan` impact if only the duplicated modern trace/legacy prompt sections are removed.

### PromptSlots

Current dependency:

```text
No direct dependency.
```

`buildPromptSlots()` consumes `shotPlan`, not `motionFacts` or `groundedMotion`.

Effect of removal:

- No direct prompt slot impact.

### Stage2Context

Current dependency:

```text
No direct dependency.
```

`buildStage2Context()` does not include either object.

Effect of removal:

- No direct compact context impact.

### Final Stage2 Prompt

Modern compressed prompt:

```text
No direct retained dependency.
```

`compressStage2Assembly()` explicitly marks both as removed:

```js
removedSections = [
  "STAGE_1_FACTS",
  "MOTION_SYNTHESIS",
  "GROUNDED_MOTION_FACTS",
  "MICRO_MOTION_LAYER",
  ...
]
```

Therefore, in the modern compressed final prompt, both `motionFacts` and `groundedMotion` contribute to the pre-compression length estimate and diagnostics, but not to retained final prompt content.

Legacy prompt:

```text
Both are directly injected.
```

`buildLegacyPlatformPrompt()` includes:

```text
MOTION_SYNTHESIS:
...

GROUNDED_MOTION_FACTS:
...
```

### Validation

Current dependency:

```text
No direct dependency.
```

`validatePrompts()` validates final prompt strings and prompt fields. It does not read either object.

Indirectly:

- `motionFacts` affects `prompts.motion_score` and `prompts.environmental_motion` via `buildVideoPromptSharedFields()`.
- Those fields are part of returned prompt metadata but are not core platform prompt validation inputs except as required fields where applicable.

## Payload Contribution Estimate

The exact runtime size depends on Stage 1 factual content, but the static structure is small.

### `motionFacts`

Shape:

```json
{
  "subjectMotion": "...",
  "environmentalMotion": "...",
  "cameraMotion": "..."
}
```

Estimated JSON contribution:

- Static field names and punctuation: about 65 chars
- Typical values: 80-350 chars
- Typical total: about 145-415 chars

### `groundedMotion`

Shape:

```json
{
  "subject_motion": "...",
  "visible_motion_cues": "...",
  "inferred_motion": "...",
  "camera_motion": "...",
  "environmental_motion": "..."
}
```

Estimated JSON contribution:

- Static field names and punctuation: about 115 chars
- Duplicated values from `motionFacts`: 80-350 chars
- Unique raw fields: 40-200 chars
- Typical total: about 235-665 chars

### Combined Contribution

Pre-compression / legacy prompt estimate:

```text
MOTION_SYNTHESIS + GROUNDED_MOTION_FACTS ≈ 380-1,080 chars
```

Modern compressed final prompt:

```text
0 direct retained chars
```

They still appear in:

- trace stages
- semantic overlap diagnostics
- `legacyLengthEstimate`

## Removal Risk

### Removing `motionFacts` entirely

Risk: **High**

Why:

- `buildVideoPromptSharedFields()` depends on it for `motion_score` and `environmental_motion`.
- `s2Prompt()` legacy path depends on it.
- `buildLegacyPlatformPrompt()` depends on it.
- `groundedMotionSummary()` depends on it.

A safe removal would require replacing all uses with direct Stage 1 factual fields or a new normalized motion object.

### Removing `groundedMotion` from modern prompt assembly only

Risk: **Low**

Why:

- Modern compressed final prompt does not retain it.
- DirectorBrief, ShotPlan, PromptSlots, Stage2Context, and validation do not consume it.
- Its modern use is primarily diagnostics and pre-compression size estimation.

### Removing `groundedMotionSummary()` entirely

Risk: **Medium**

Why:

- Legacy prompt paths still inject `GROUNDED_MOTION_FACTS`.
- It adds raw `visible_motion_cues` and `inferred_motion`, which are useful evidence fields if legacy prompts are still used.
- Existing diagnostics compare it against `motionFacts`.

### Merging systems

Risk: **Low to Medium**

Best candidate:

Create one normalized object with both synthesized and raw evidence fields:

```json
{
  "subjectMotion": "...",
  "cameraMotion": "...",
  "environmentalMotion": "...",
  "visibleMotionCues": "...",
  "inferredMotion": "..."
}
```

Then:

- `buildVideoPromptSharedFields()` can keep using normalized camelCase fields.
- Legacy prompt paths can still expose raw evidence.
- Diagnostics can compare synthesized vs raw fields inside one object.

## Recommendation

Do not remove `motionFacts`.

It is still the functional normalizer and feeds shared video metadata.

`groundedMotion` appears to be a convenience wrapper that duplicates most of `motionFacts` and adds two raw Stage 1 fields. It is useful for legacy prompts and diagnostics, but it does not appear to contribute unique information to the modern compressed final Stage 2 prompt.

Recommended next experiment:

1. Keep `generateImageMotionFacts()`.
2. Add a feature flag to omit `GROUNDED_MOTION_FACTS` from legacy length estimation and diagnostics only.
3. Compare:
   - final Stage 2 prompt
   - generated platform prompt
   - validation results
   - prompt quality scores
4. If unchanged, consider merging `groundedMotionSummary()` into a single normalized motion evidence object.

## Final Assessment

| System | Keep / simplify / merge |
|---|---|
| `motionFacts` | Keep. Required by shared video fields and legacy prompt paths. |
| `groundedMotion` | Candidate to merge/simplify. High overlap and no direct modern final-prompt consumption. |

No code was modified for this audit.
