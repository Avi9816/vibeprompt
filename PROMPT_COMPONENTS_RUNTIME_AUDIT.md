# PromptComponents Runtime Dependency Audit

## Summary

`PromptComponents`, `ProfileAssembly`, and `PlatformWriter` do not appear operationally required for the modern compressed prompt pipeline.

They are built, logged, and passed into `buildStage2Context()`, but `buildStage2Context()` currently ignores those inputs and builds compact context directly from `factual` and `stage2Scope`.

The final Stage 2 prompt is assembled from:

- `PLATFORM_PROFILE`
- `PLATFORM_TEMPLATE`
- `DIRECTOR_BRIEF`
- `AUDIO_GUIDANCE`
- `DIRECTOR_PROMPT`
- `SHOT_PLAN`
- `PROMPT_SLOTS`
- `COMPACT_CONTEXT`
- `SPEECH_LANGUAGE`
- rules

It does not serialize:

- `prompt_components`
- `profile_assembly`
- `platform_writer`

## Functions Audited

### 1. `buildPromptComponents(factual)`

Source: `backend/analyzer.js`

#### Inputs

Single input:

```js
factual
```

Reads many Stage 1 / semantic fields, including:

- `creator_archetype`
- `hero_element`
- `primary_object`
- `product_identity`
- `subjects`
- `face`
- `creator_intent`
- `performance_pattern`
- `presentation_style`
- `pose_action`
- `camera_style`
- `camera_energy`
- `camera_relationship`
- `viewer_perspective`
- `camera_intention`
- `camera_motion`
- `lens_feel`
- `environment`
- `surfaces`
- `lighting`
- social/reel/motion/audio/emotion fields

It also calls:

```js
buildActionAbstraction(factual)
translateToSocialMotionLanguage(...)
```

#### Outputs

Returns 11 broad buckets:

```js
{
  subject,
  action,
  camera,
  environment,
  lighting,
  atmosphere,
  motion,
  temporal,
  audio,
  emotion,
  finish
}
```

#### Direct Consumers

| Consumer | Purpose |
|---|---|
| `briefComponents = directorBrief ? {...promptComponents, ...directorBrief} : promptComponents` | Merges components with `DirectorBrief`; overlapping fields are overwritten by `DirectorBrief`. |
| `assemblePromptFromProfile(field, promptProfile, briefComponents)` | Uses component-like fields to build a profile-ordered section list. |
| `writePlatformStyle(field, promptProfile, briefComponents, profileAssembly, directorBrief)` | Receives components but does not materially use them beyond passing through the assembly/writer object. |
| `buildStage2Context(..., {...briefComponents, profile_assembly, platform_writer}, ...)` | Receives the merged object as `promptComponents`, but does not read it. |

#### Does Output Reach Key Systems?

| Target | Reaches? | Notes |
|---|---:|---|
| DirectorBrief | No | `DirectorBrief` is built before `PromptComponents`. |
| ShotPlan | No | `ShotPlan` is built before `PromptComponents`. |
| PromptSlots | No | `PromptSlots` is built before `PromptComponents`. |
| Stage2Context | Passed, but not consumed | `buildStage2Context()` signature accepts `promptComponents`, but current implementation does not read it. |
| compressStage2Assembly() | No | No `promptComponents` argument is passed to compression. |
| final Stage2 prompt | No | Not serialized. |
| generated platform prompts | No direct path | Only possible if final prompt changed, which static dependency says it should not. |
| validation | No | `validatePrompts()` reads final prompt strings and factual audio fields only. |
| quality scoring | No | `scorePromptQuality()` runs on generated prompt text, not components. |

## 2. `assemblePromptFromProfile(platform, profile, components)`

Source: `backend/analyzer.js`

#### Inputs

```js
platform
profile
components
```

Reads:

- `profile.preferred_structure`
- component fields selected by mapping profile labels to:
  - `camera`
  - `subject`
  - `action`
  - `environment`
  - `finish`
  - `atmosphere`
  - `audio`
  - `motion`
  - `emotion`
  - `temporal`
  - `lighting`

#### Outputs

```js
{
  platform,
  order,
  sections,
  text
}
```

Where:

- `order` is `profile.preferred_structure`
- `sections` is the subset with usable component values
- `text` is joined section values

#### Direct Consumers

| Consumer | Purpose |
|---|---|
| `writePlatformStyle(..., profileAssembly, ...)` | Passed into writer output. |
| `[assembly order]` log | Diagnostic visibility. |
| `buildStage2Context(..., {...briefComponents, profile_assembly: profileAssembly, ...})` | Passed inside `promptComponents` argument, but not read by current `buildStage2Context()`. |

#### Does Output Reach Key Systems?

| Target | Reaches? | Notes |
|---|---:|---|
| DirectorBrief | No | Built earlier. |
| ShotPlan | No | Built earlier. |
| PromptSlots | No | Built earlier. |
| Stage2Context | Passed, but not consumed | `profile_assembly` is not read. |
| compressStage2Assembly() | No | Not passed to compression. |
| final Stage2 prompt | No | Not serialized. |
| generated platform prompts | No direct path | Not present in Gemini prompt. |
| validation | No | Not read. |
| quality scoring | No | Not read. |

## 3. `writePlatformStyle(platform, profile, components, assembly, directorBrief)`

Source: `backend/analyzer.js`

#### Inputs

```js
platform
profile
components
assembly
directorBrief
```

Reads:

- `profile.writing_style`
- `assembly.sections`
- `directorBrief`
- platform key to choose style label

Notably, `components` is accepted but not materially read in `platformWriter()`.

#### Outputs

```js
{
  platform,
  style,
  writing_style,
  director_brief,
  sections,
  instruction
}
```

#### Direct Consumers

| Consumer | Purpose |
|---|---|
| `[platform writer]` log | Diagnostic visibility. |
| `buildStage2Context(..., {..., platform_writer: platformWriterOutput}, ...)` | Passed inside `promptComponents` argument, but not read. |

#### Does Output Reach Key Systems?

| Target | Reaches? | Notes |
|---|---:|---|
| DirectorBrief | No | It embeds `director_brief` as data, but does not modify the actual DirectorBrief. |
| ShotPlan | No | Built earlier. |
| PromptSlots | No | Built earlier. |
| Stage2Context | Passed, but not consumed | `platform_writer` is not read. |
| compressStage2Assembly() | No | Not passed to compression. |
| final Stage2 prompt | No | Not serialized. |
| generated platform prompts | No direct path | Not present in Gemini prompt. |
| validation | No | Not read. |
| quality scoring | No | Not read. |

## Runtime Call Chain

```text
buildPlatformPrompt()
  -> buildDirectorBrief()
  -> buildPromptComponents()
  -> briefComponents = {...promptComponents, ...directorBrief}
  -> assemblePromptFromProfile(platform, promptProfile, briefComponents)
  -> writePlatformStyle(platform, promptProfile, briefComponents, profileAssembly, directorBrief)
  -> buildStage2Context(
       factual,
       shotPlan,
       promptSlots,
       {...briefComponents, profile_assembly: profileAssembly, platform_writer: platformWriterOutput},
       directorBrief,
       stage2Scope
     )
  -> compressStage2Assembly(...)
  -> final Stage2 prompt
```

Critical point:

```js
function buildStage2Context(factual, shotPlan, promptSlots, promptComponents={}, directorBrief=null, stage2Scope={}) {
  ...
  const compact = {
    content_type: cleanFact(factual?.content_type),
    reel_type: cleanFact(factual?.reel_type),
    ...
  };
}
```

The `promptComponents` argument is not read.

## Dependency Graph

```text
factual
  ├─ buildPromptComponents()
  │    └─ promptComponents
  │         └─ briefComponents
  │              └─ assemblePromptFromProfile()
  │                   └─ profileAssembly
  │                        └─ writePlatformStyle()
  │                             └─ platformWriterOutput
  │                                  └─ passed into buildStage2Context()
  │                                       └─ not consumed
  │
  ├─ buildDirectorBrief()
  │    └─ DIRECTOR_BRIEF
  │         └─ compressStage2Assembly()
  │              └─ final Stage2 prompt
  │
  ├─ buildShotPlan()
  │    └─ SHOT_PLAN
  │         └─ compressStage2Assembly()
  │              └─ final Stage2 prompt
  │
  └─ buildPromptSlots()
       └─ PROMPT_SLOTS
            └─ compressStage2Assembly()
                 └─ final Stage2 prompt
```

## Runtime Consumers

### Active Consumers

| Output | Active consumer | Runtime effect |
|---|---|---|
| `promptComponents` | `assemblePromptFromProfile()` | Builds an intermediate assembly object. |
| `profileAssembly` | `writePlatformStyle()` | Builds a writer output object. |
| `platformWriterOutput` | None after creation | Passed onward but not read. |

### Dead Consumers

| Output | Dead / ineffective consumer | Why dead |
|---|---|---|
| `promptComponents` | `buildStage2Context()` | Argument exists but implementation does not read it. |
| `profileAssembly` | `buildStage2Context()` via `profile_assembly` | Nested inside ignored `promptComponents` argument. |
| `platformWriterOutput` | `buildStage2Context()` via `platform_writer` | Nested inside ignored `promptComponents` argument. |
| `profileAssembly.text` | None | Never serialized into final prompt. |
| `platformWriterOutput.instruction` | None | Never serialized into final prompt. |

## Final Prompt Reach

| Structure | Reaches final Stage2 prompt? | Evidence |
|---|---:|---|
| `PromptComponents` | No | Not serialized by `compressStage2Assembly()`. |
| `ProfileAssembly` | No | Not passed to `compressStage2Assembly()`. |
| `PlatformWriterOutput` | No | Not passed to `compressStage2Assembly()`. |
| `DirectorBrief` | Yes | Passed directly and serialized as `DIRECTOR_BRIEF`. |
| `ShotPlan` | Yes | Passed directly and serialized as `SHOT_PLAN`. |
| `PromptSlots` | Yes | Passed directly and serialized as `PROMPT_SLOTS`. |
| `Stage2Context` selected fields | Yes | `minimalContext` is serialized as `COMPACT_CONTEXT`. |

## Estimated Payload Contribution

### `PromptComponents`

Shape:

```js
{
  subject,
  action,
  camera,
  environment,
  lighting,
  atmosphere,
  motion,
  temporal,
  audio,
  emotion,
  finish
}
```

Estimated diagnostic/intermediate JSON:

```text
800-2,500 chars
```

Final Stage2 prompt contribution:

```text
0 chars
```

### `ProfileAssembly`

Shape:

```js
{
  platform,
  order,
  sections,
  text
}
```

Estimated diagnostic/intermediate JSON:

```text
500-1,800 chars
```

Final Stage2 prompt contribution:

```text
0 chars
```

### `PlatformWriterOutput`

Shape:

```js
{
  platform,
  style,
  writing_style,
  director_brief,
  sections,
  instruction
}
```

Estimated diagnostic/intermediate JSON:

```text
1,000-4,000 chars
```

Final Stage2 prompt contribution:

```text
0 chars
```

## Estimated Complexity Contribution

### Runtime Complexity

Per platform, this chain performs:

1. One full `buildPromptComponents()` pass over many factual fields.
2. One `buildActionAbstraction()` call inside `buildPromptComponents()`.
3. One `translateToSocialMotionLanguage()` call for motion.
4. One profile structure mapping pass.
5. One platform writer object construction.
6. One trace stage for components and one trace stage for writer output.
7. Additional logs:
   - `[prompt components]`
   - `[assembly order]`
   - `[platform writer]`

For five modern video platforms, this repeats five times.

Estimated code complexity:

```text
Medium
```

Estimated runtime cost:

```text
Low to medium
```

Most cost is local string/object work and logging, not AI calls.

Estimated cognitive complexity:

```text
High
```

Reason: these names imply active prompt-writing behavior, but current final assembly does not consume them.

## Validation And Quality Scoring

### Validation

`validatePrompts()` reads:

- generated prompt strings
- required prompt fields
- `factual.audio_type`

It does not read:

- `promptComponents`
- `profileAssembly`
- `platformWriterOutput`

### Quality Scoring

`scorePromptQuality(platform, prompts[platform], profile)` runs after generated platform prompts exist.

It reads:

- generated prompt text
- platform profile

It does not read:

- `promptComponents`
- `profileAssembly`
- `platformWriterOutput`

## Bypass Question

### If PromptComponents, ProfileAssembly, And PlatformWriter Are Bypassed, What User-Visible Behavior Changes?

Expected answer:

```text
None for modern generated prompts.
```

Reason:

- The final Stage2 prompt should remain unchanged.
- Gemini receives the same retained structures:
  - `PLATFORM_PROFILE`
  - `PLATFORM_TEMPLATE`
  - `DIRECTOR_BRIEF`
  - `AUDIO_GUIDANCE`
  - `DIRECTOR_PROMPT`
  - `SHOT_PLAN`
  - `PROMPT_SLOTS`
  - `COMPACT_CONTEXT`
- Validation reads generated prompt strings, not these intermediates.
- UI reads final API response prompts, not these intermediates.
- Benchmarking stores master/Veo/platform prompts, not these intermediates.

Expected visible changes:

- none in generated platform prompt text
- none in UI
- none in API response fields
- none in validation results
- none in benchmark saved fields

Expected non-visible changes:

- fewer diagnostic logs
- smaller trace/pipeline report
- lower intermediate memory churn
- less confusing architecture

## Caveats

This audit is static/runtime-path based. It does not include a replayed real payload comparison in this turn.

Existing experiment support already exists:

```text
VP_DISABLE_PROMPT_COMPONENTS=1
```

The previous experiment report predicted no final Stage2 prompt diff, but runtime comparison was not executed because no captured real payload was available.

## Final Assessment

`PromptComponents`, `ProfileAssembly`, and `PlatformWriter` are not operationally required in the modern compressed pipeline as currently implemented.

They are intermediate convenience/diagnostic layers whose outputs do not survive to final prompt assembly.

Recommended next step, if proceeding experimentally:

1. Use the existing `VP_DISABLE_PROMPT_COMPONENTS=1` flag.
2. Replay the same real payload twice.
3. Compare:
   - `[stage2 final prompt] promptPreview`
   - final prompt length
   - generated platform prompt text
   - validation logs
   - quality scoring logs

Expected result:

```text
No user-visible behavior changes.
```

No code was modified for this audit.
