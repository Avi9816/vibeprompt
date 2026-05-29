# PromptComponents Experiment Report

Date: 2026-05-29

Experiment flag:

```powershell
VP_DISABLE_PROMPT_COMPONENTS=1
```

## Goal

Determine whether `PromptComponents` has an observable effect on generated platform prompts.

## Implementation

When `VP_DISABLE_PROMPT_COMPONENTS=1`:

1. `buildPromptComponents()` is skipped.
2. `assemblePromptFromProfile()` is skipped.
3. `writePlatformStyle()` is skipped.

When the flag is disabled, behavior remains unchanged.

The experiment does not modify:

- `DirectorBrief`
- `ShotPlan`
- `PromptSlots`
- `Stage2Context`
- `compressStage2Assembly()`
- final prompt assembly
- validation
- refinement
- platform generation

## Diagnostics Added

Each platform generation now logs:

```json
{
  "enabled": true,
  "platform": "veo",
  "promptComponentsBuilt": false,
  "profileAssemblyBuilt": false,
  "platformWriterBuilt": false,
  "finalPromptChars": 0
}
```

under:

```text
[prompt-components experiment]
```

## Expected Static Effect

Based on the dependency audit:

- `PromptComponents` feeds `assemblePromptFromProfile()`.
- `assemblePromptFromProfile()` feeds `platformWriterOutput`.
- `platformWriterOutput` is passed into `buildStage2Context()`.
- `buildStage2Context()` no longer stores nested `prompt_components`, `profile_assembly`, or `platform_writer`.
- `compressStage2Assembly()` does not read `promptComponents`, `profileAssembly`, or `platformWriterOutput`.

Therefore the expected final Stage2 prompt diff is:

```text
no difference
```

provided the same input is used and no unrelated nondeterminism is introduced.

## Comparison Mode

Requested comparison:

```powershell
VP_DISABLE_PROMPT_COMPONENTS=0
VP_DISABLE_PROMPT_COMPONENTS=1
```

For identical inputs, compare:

- final Stage2 prompt
- generated platform prompt
- validation scores
- prompt quality scores

## Runtime Comparison Status

Not executed in this workspace.

Reason:

- No captured real analysis payload is available locally.
- Running with mock benchmark JSON would not exercise the actual image/reel analysis path.
- Running a true generated-platform comparison requires the same captured image/video payload replayed twice through the backend.

No synthetic comparison was fabricated.

## Prompt Diff

Not available yet.

Expected from static dependency analysis:

```text
Final Stage2 prompt should be unchanged.
```

## Size Diff

Not available from runtime.

Expected static result:

| Mode | Expected Final Stage2 Prompt Size |
|---|---|
| `VP_DISABLE_PROMPT_COMPONENTS=0` | unchanged |
| `VP_DISABLE_PROMPT_COMPONENTS=1` | unchanged |

The diagnostic field `finalPromptChars` will confirm this during a real run.

## Validation Diff

Not available from runtime.

Expected static result:

```text
No validation difference, because validation operates on generated platform prompts and factual data, not PromptComponents.
```

## Quality Score Diff

Not available from runtime.

Expected static result:

```text
No prompt quality score difference unless the generated platform prompt changes.
```

## How To Run The Experiment

Use one captured input and run it twice.

Baseline:

```powershell
$env:VP_DISABLE_PROMPT_COMPONENTS="0"
node server.js
```

Experiment:

```powershell
$env:VP_DISABLE_PROMPT_COMPONENTS="1"
node server.js
```

For each run, collect:

- `[prompt-components experiment]`
- `[stage2 final prompt]`
- `[prompt quality]`
- `[platform alignment]`
- validation logs
- generated platform prompts in the response

Compare the `promptPreview`, `promptLength`, generated prompt text, and validation/quality logs.

## Verification

Syntax check:

```powershell
node --check backend\analyzer.js
```

Result:

- Passed.

## Current Conclusion

The bypass experiment is implemented and gated.

Static dependency analysis predicts `PromptComponents` has no material effect on final platform Stage2 prompt assembly in the current pipeline. A replayed identical payload is still needed to confirm that generated platform prompts and quality scores are unchanged at runtime.
