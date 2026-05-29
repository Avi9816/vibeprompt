# PromptComponents Removal Report

## Summary

Removed the proven-unused PromptComponents infrastructure from the modern Stage 2 prompt pipeline.

The retained modern prompt pipeline remains:

```text
DirectorBrief
DirectorPrompt
ShotPlan
PromptSlots
PlatformTemplate
PlatformProfile
Stage2Context
compressStage2Assembly()
validation
quality scoring
API response shape
```

No prompt behavior was intentionally changed.

## Files Modified

| File | Change |
|---|---|
| `backend/analyzer.js` | Removed PromptComponents/ProfileAssembly/PlatformWriter function chain and related runtime block. |

## Code Removed

Removed functions:

- `buildPromptComponents()`
- `assemblePromptFromProfile()`
- `writingStyleSummary()`
- `platformWriter()`
- `writeVeoStyle()`
- `writeSoraStyle()`
- `writeRunwayStyle()`
- `writeKlingStyle()`
- `writePikaStyle()`
- `writePlatformStyle()`

Removed runtime intermediates:

- `promptComponentsExperimentEnabled`
- `promptComponents`
- `briefComponents`
- `profileAssembly`
- `platformWriterOutput`

Removed experiment flag usage:

```text
VP_DISABLE_PROMPT_COMPONENTS
```

## Diagnostics Removed

Removed logs:

- `[prompt components]`
- `[assembly order]`
- `[platform writer]`
- `[prompt-components experiment]`

Removed trace stages:

- `buildPromptComponents`
- `writePlatformStyle`

## Stage 2 Context Change

Before:

```js
buildStage2Context(
  factual,
  shotPlan,
  promptSlots,
  {
    ...briefComponents,
    profile_assembly: profileAssembly,
    platform_writer: platformWriterOutput
  },
  directorBrief,
  stage2Scope
)
```

After:

```js
buildStage2Context(
  factual,
  shotPlan,
  promptSlots,
  {},
  directorBrief,
  stage2Scope
)
```

This preserves `buildStage2Context()` itself and its existing output. The removed `promptComponents` argument was not read by the function.

## Preserved Systems

The following were not removed:

- `buildDirectorBrief()`
- `buildDirectorPrompt()`
- `buildShotPlan()`
- `buildPromptSlots()`
- `buildPlatformPromptTemplate()`
- `getPlatformGenerationProfile()`
- `loadPromptProfile()`
- `buildStage2Context()`
- `compressStage2Assembly()`
- validation
- quality scoring
- API response shape
- UI/export behavior

## Estimated Complexity Reduction

Static diff:

```text
backend/analyzer.js | 146 +---------------------------------------------------
1 file changed, 1 insertion(+), 145 deletions(-)
```

Removed per-platform runtime work:

- one component aggregation pass
- one profile structure mapping pass
- one platform writer object construction
- two trace/log stages
- multiple intermediate objects

Expected runtime impact:

- slightly lower CPU/object churn
- fewer logs
- smaller pipeline traces
- easier Stage 2 reasoning

Expected final prompt size impact:

```text
None
```

The removed structures were not serialized into the final compressed Stage 2 prompt.

## Compatibility Impact

### API response

No expected change.

The public response still comes from generated prompts and existing metadata fields.

### UI

No expected change.

The extension reads final `data.prompts`, `data.factual`, and debug metadata, not PromptComponents.

### JSON export

No expected change.

JSON export downloads the frontend result object. PromptComponents were not part of the returned public response shape.

### Validation

No expected change.

`validatePrompts()` validates generated prompt strings and factual audio fields. It did not read PromptComponents, ProfileAssembly, or PlatformWriter output.

### Quality scoring

No expected change.

Prompt quality scoring reads generated platform prompt text and profile metadata, not the removed intermediates.

### Benchmarks

No expected change.

Benchmark systems store `master_prompt`, `platform_prompt`/`veo_prompt`, scores, notes, and issue tags.

## Verification

Passed:

```text
node --check backend\analyzer.js
```

Reference search after removal found no remaining references in `backend/analyzer.js` for:

- `buildPromptComponents`
- `assemblePromptFromProfile`
- `writePlatformStyle`
- `profileAssembly`
- `platformWriterOutput`
- `VP_DISABLE_PROMPT_COMPONENTS`
- `[prompt-components experiment]`

## Final Assessment

The PromptComponents chain has been removed from the codebase while preserving the modern compressed Stage 2 pipeline.

This removal should reduce complexity and diagnostics noise without changing user-visible prompt generation behavior.
