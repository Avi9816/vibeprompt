# Platform Metadata Compression Experiment

## Goal

Measure whether `PLATFORM_PROFILE` can be reduced by 350-550 characters without degrading platform-native prompt quality.

Feature flag:

```txt
VP_COMPACT_PLATFORM_METADATA=1
```

## Files Modified

- `backend/analyzer.js`

## Scope

Only `PLATFORM_PROFILE` serialization is affected.

No changes were made to:

- `PLATFORM_TEMPLATE`
- `platformNativeDirectives()`
- `DirectorBrief`
- `ShotPlan`
- `PromptSlots`
- validation
- quality scoring
- platform prompt profiles on disk
- reference patterns on disk

## Disabled Behavior

When the flag is disabled, `compactProfileForStage2()` returns the same profile object as before:

```js
{
  structure,
  style,
  emphasis,
  ideal_length,
  avoid,
  writing,
  pattern
}
```

Prompt behavior remains unchanged.

## Enabled Behavior

When enabled, `PLATFORM_PROFILE` is compressed to:

```js
{
  structure,
  emphasis,
  ideal_length,
  avoid
}
```

### Fields Retained

Retained:

- `structure`
- top 3 `emphasis` values by score
- `ideal_length.minimum_words`
- `ideal_length.maximum_words`
- top 3 `avoid` terms

### Fields Removed

Removed from the Stage 2 serialized `PLATFORM_PROFILE`:

- reference-pattern frequency data
- duplicated writing guidance
- duplicated style guidance
- duplicated structure prose
- sentence-structure guidance
- preferred-wording guidance
- level-of-detail guidance
- full avoid list after the first 3 terms
- full emphasis list after the top 3 values

## Diagnostics

Added:

```txt
[platform metadata experiment]
{
  "enabled": true,
  "originalChars": 900,
  "compressedChars": 350,
  "charsSaved": 550
}
```

When disabled:

```txt
[platform metadata experiment]
{
  "enabled": false,
  "originalChars": 900,
  "compressedChars": 900,
  "charsSaved": 0
}
```

`originalChars` is the serialized size of the previous full Stage 2 profile representation using the same `compactJson(..., 900)` cap.

`compressedChars` is the serialized size of the active profile representation.

## Expected Prompt Impact

Expected behavior impact should be limited because the removed metadata is duplicated elsewhere:

- platform style still exists in `PLATFORM_TEMPLATE`
- platform directives still exist in `platformNativeDirectives()`
- slot order still exists in `PROMPT_SLOTS`
- shot structure still exists in `SHOT_PLAN`
- reel-specific content remains in `DIRECTOR_BRIEF`

The experiment removes reinforcement, not factual input.

## Expected Size Reduction

Expected reduction:

```txt
350-550 chars
```

Highest savings should appear on richer profiles such as Veo and Sora, where the full profile previously included:

- long writing rules
- reference pattern frequencies
- longer avoid lists
- larger emphasis maps

## Comparison Checklist

Run the same sample with:

```txt
VP_COMPACT_PLATFORM_METADATA=0
VP_COMPACT_PLATFORM_METADATA=1
```

Compare:

- `[platform metadata experiment]`
- `[compressed prompt]`
- `[stage2 final prompt]`
- generated platform prompt text
- validation diagnostics
- `[prompt quality]`
- `[platform alignment]`

## Expected Runtime Behavior

With flag disabled:

- final Stage 2 prompt should match prior behavior
- `charsSaved` should be `0`

With flag enabled:

- `PLATFORM_PROFILE` should be shorter
- final Stage 2 prompt should gain budget before the truncation boundary
- `PLATFORM_TEMPLATE`, `DIRECTOR_BRIEF`, `SHOT_PLAN`, and `PROMPT_SLOTS` should remain unchanged

## Risk Assessment

Risk: medium.

Reason:

- This removes duplicated platform metadata from the Gemini payload.
- It does not remove platform instructions entirely.
- The main risk is weaker platform-specific style reinforcement, especially if Gemini was relying on repeated profile wording.

Best success signal:

- final prompt length drops materially
- generated prompts remain platform-distinct
- validation and quality scores remain stable

