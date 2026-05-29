# PromptComponents Usage Report

Date: 2026-05-29

Scope:

- `buildPromptComponents()`
- `assemblePromptFromProfile()`
- `writePlatformStyle()`
- downstream Stage 2 prompt assembly
- refinement, validation, and master prompt systems

Source file:

- `backend/analyzer.js`

No code was changed for this report.

## Executive Summary

`buildPromptComponents()` produces 11 broad buckets:

- `subject`
- `action`
- `camera`
- `environment`
- `lighting`
- `atmosphere`
- `motion`
- `temporal`
- `audio`
- `emotion`
- `finish`

The direct consumer is `assemblePromptFromProfile()`, which maps platform profile labels to one of these component keys and produces `profileAssembly.sections`.

However, after `DirectorBrief` is merged into the component object:

```js
const briefComponents = directorBrief ? {...promptComponents, ...directorBrief} : promptComponents;
```

DirectorBrief fields override overlapping component fields such as:

- `subject`
- `action`
- `camera`
- `environment`
- `lighting`
- `motion`
- `audio`

Then `profileAssembly` and `platformWriterOutput` are passed into `buildStage2Context()`, but `compressStage2Assembly()` does not consume them. `compactJson()` also explicitly prunes:

- `prompt_components`
- `profile_assembly`
- `platform_writer`

This means `PromptComponents` is currently a convenience aggregation layer for profile assembly logs/intermediate structures, not a direct final prompt generation layer.

## Consumer Chain

1. `buildPromptComponents(factual)`
2. `briefComponents = {...promptComponents, ...directorBrief}`
3. `assemblePromptFromProfile(field, promptProfile, briefComponents)`
4. `writePlatformStyle(field, promptProfile, briefComponents, profileAssembly, directorBrief)`
5. `buildStage2Context(..., {...briefComponents, profile_assembly, platform_writer}, ...)`
6. `compressStage2Assembly(...)`

Critical observation:

- `compressStage2Assembly()` does not read `profileAssembly`, `platformWriterOutput`, or `promptComponents`.
- The final Stage 2 prompt does not include `profile_assembly`, `platform_writer`, or `prompt_components`.

## Field Usage Matrix

| Field Name | Consumers | Used In Final Prompt | Used In Refinement | Used In Validation | Used In Master Prompt | Write-Only |
|---|---|---|---|---|---|---|
| `subject` | `assemblePromptFromProfile()` if profile structure maps to subject and DirectorBrief does not override; otherwise overwritten by `directorBrief.subject` in `briefComponents` | No direct use from PromptComponents | No | No | No | Mostly |
| `action` | `assemblePromptFromProfile()` if profile structure maps to action and DirectorBrief does not override; otherwise overwritten by `directorBrief.action` | No direct use from PromptComponents | No | No | No | Mostly |
| `camera` | `assemblePromptFromProfile()` if profile structure maps to camera and DirectorBrief does not override; otherwise overwritten by `directorBrief.camera` | No direct use from PromptComponents | No | No | No | Mostly |
| `environment` | `assemblePromptFromProfile()` if profile structure maps to scene/environment and DirectorBrief does not override; otherwise overwritten by `directorBrief.environment` | No direct use from PromptComponents | No | No | No | Mostly |
| `lighting` | `assemblePromptFromProfile()` if profile structure maps to lighting and DirectorBrief does not override; otherwise overwritten by `directorBrief.lighting` | No direct use from PromptComponents | No | No | No | Mostly |
| `atmosphere` | `assemblePromptFromProfile()` when profile structure maps to ambiance/atmosphere/mood | No direct use from PromptComponents | No | No | No | Yes after profile assembly |
| `motion` | `assemblePromptFromProfile()` if profile structure maps to motion and DirectorBrief does not override; otherwise overwritten by `directorBrief.motion` | No direct use from PromptComponents | No | No | No | Mostly |
| `temporal` | `assemblePromptFromProfile()` when profile structure maps to temporal/progression/continuity | No direct use from PromptComponents | No | No | No | Yes after profile assembly |
| `audio` | `assemblePromptFromProfile()` if profile structure maps to audio and DirectorBrief does not override; otherwise overwritten by `directorBrief.audio` | No direct use from PromptComponents | No | No | No | Mostly |
| `emotion` | `assemblePromptFromProfile()` when profile structure maps to emotion/tone | No direct use from PromptComponents | No | No | No | Yes after profile assembly |
| `finish` | `assemblePromptFromProfile()` when profile structure maps to style/quality/modifier/finish/visual | No direct use from PromptComponents | No | No | No | Yes after profile assembly |

## Detailed Field Notes

### `subject`

Source:

- `creator_archetype`
- `hero_element`
- `primary_object`
- `product_identity`
- `subjects`
- `face`

Duplicate with DirectorBrief:

- `DirectorBrief.subject`

Downstream reality:

- In `briefComponents`, `DirectorBrief.subject` overwrites `PromptComponents.subject`.
- Final prompt generation uses `DirectorBrief.subject`, not the original component bucket.

### `action`

Source:

- `creator_intent`
- `performance_pattern`
- `presentation_style`
- action abstraction
- `pose_action`

Duplicate with DirectorBrief:

- `DirectorBrief.action`
- `DirectorBrief.generation_intent`
- `DirectorBrief.performance_pattern`

Downstream reality:

- Overwritten by `DirectorBrief.action`.
- Not directly used in final prompt generation.

### `camera`

Source:

- `camera_style`
- `camera_energy`
- `camera_relationship`
- `viewer_perspective`
- `camera_intention`
- `camera_motion`
- `lens_feel`

Duplicate with DirectorBrief:

- `DirectorBrief.camera`
- `DirectorBrief.camera_style`
- `DirectorBrief.camera_energy`
- `DirectorBrief.camera_relationship`
- `DirectorBrief.viewer_perspective`

Downstream reality:

- Overwritten by `DirectorBrief.camera`.
- Not directly serialized into final Stage 2 prompt from PromptComponents.

### `environment`

Source:

- `environment`
- `surfaces`

Duplicate with DirectorBrief:

- `DirectorBrief.environment`

Downstream reality:

- Overwritten by `DirectorBrief.environment`.

### `lighting`

Source:

- `lighting`

Duplicate with DirectorBrief:

- `DirectorBrief.lighting`

Downstream reality:

- Overwritten by `DirectorBrief.lighting`.

### `atmosphere`

Source:

- creator/social/reel/dance/viewer/mood fields

Duplicate with DirectorBrief:

- `DirectorBrief.mood`
- `DirectorBrief.reel_energy`
- `DirectorBrief.creator_archetype`
- `DirectorBrief.content_personality`
- `DirectorBrief.social_aesthetic`
- `DirectorBrief.viewer_feeling`
- `DirectorBrief.creator_confidence`
- `DirectorBrief.viewer_hook_style`

Downstream reality:

- May appear in `profileAssembly.sections` if the profile requests atmosphere.
- Does not survive final Stage 2 prompt assembly because `profileAssembly` is not serialized.

### `motion`

Source:

- pose rhythm
- social behavior
- attention/focus fields
- body/motion rhythm fields
- subject/visible/inferred/environmental motion
- music sync
- temporal/performance progression

Duplicate with DirectorBrief:

- `DirectorBrief.motion`
- `DirectorBrief.pose_rhythm`
- `DirectorBrief.social_behavior`
- `DirectorBrief.performance_pattern`

Downstream reality:

- Overwritten by `DirectorBrief.motion`.

### `temporal`

Source:

- temporal fields
- movement continuity
- pose rhythm
- performance style
- visible motion
- scene purpose/activity context

Duplicate with DirectorBrief:

- `DirectorBrief.temporal_opening`
- `DirectorBrief.temporal_progression`
- `DirectorBrief.temporal_continuity`
- `DirectorBrief.moment_flow`
- `DirectorBrief.scene_evolution`
- `DirectorBrief.performance_progression`

Downstream reality:

- May appear in `profileAssembly.sections` if the profile requests temporal structure.
- Does not survive final Stage 2 prompt assembly through `profileAssembly`.

### `audio`

Source:

- `audio_type`
- `speech_language`
- `dialogue_summary`
- `spoken_topic`
- music/ambient fields

Duplicate with DirectorBrief:

- `DirectorBrief.audio`
- `DirectorBrief.dialogue`
- `DirectorBrief.dialogue_summary`
- `DirectorBrief.music_mood`
- `DirectorBrief.ambient_audio`

Downstream reality:

- Overwritten by `DirectorBrief.audio`.

### `emotion`

Source:

- viewer relationship
- creator presence
- performance intensity
- viewer feeling
- camera engagement/presence
- mood
- speaker intent

Duplicate with DirectorBrief:

- `DirectorBrief.viewer_relationship`
- `DirectorBrief.creator_presence`
- `DirectorBrief.performance_intensity`
- `DirectorBrief.mood`

Downstream reality:

- May appear in `profileAssembly.sections` if the profile requests emotion/tone.
- Does not survive final Stage 2 prompt assembly through `profileAssembly`.

### `finish`

Source:

- visual focus fields
- lens feel
- color palette
- lighting

Duplicate with DirectorBrief:

- `DirectorBrief.visual_goal`
- `DirectorBrief.primary_visual_focus`
- `DirectorBrief.secondary_visual_focus`
- `DirectorBrief.visual_priority_flow`
- `DirectorBrief.lighting`

Downstream reality:

- May appear in `profileAssembly.sections` if the profile requests finish/style/visual.
- Does not survive final Stage 2 prompt assembly through `profileAssembly`.

## Final Prompt Reach

PromptComponents fields do **not** directly reach:

- `DIRECTOR_BRIEF`
- `DIRECTOR_PROMPT`
- `SHOT_PLAN`
- `PROMPT_SLOTS`
- `COMPACT_CONTEXT`
- `SPEECH_LANGUAGE`

They are used only to create `profileAssembly` and `platformWriterOutput`, but those are not serialized into the final Stage 2 prompt.

## Refinement / Validation Usage

Refinement systems use `promptContext.brief`, not PromptComponents.

Validation systems use:

- final generated prompt text
- `promptContext.brief`
- `promptContext.factual`

They do not read PromptComponents directly.

## Master Prompt Usage

`buildMasterPromptFromBrief()` reads `DirectorBrief`, not PromptComponents.

PromptComponents do not feed master prompt generation.

## Totals

| Category | Count |
|---|---:|
| Total PromptComponents fields | 11 |
| Consumed by `assemblePromptFromProfile()` | 11 conditionally |
| Consumed by `writePlatformStyle()` directly | 0 |
| Reaches final platform Stage2 prompt directly | 0 |
| Used by refinement systems | 0 |
| Used by validation systems | 0 |
| Used by master prompt generation | 0 |
| Write-only after profile assembly | 11 |

## Fields Duplicated By DirectorBrief

All 11 fields are duplicated conceptually by DirectorBrief:

- `subject` -> `DirectorBrief.subject`
- `action` -> `DirectorBrief.action`, `generation_intent`
- `camera` -> `DirectorBrief.camera`
- `environment` -> `DirectorBrief.environment`
- `lighting` -> `DirectorBrief.lighting`
- `atmosphere` -> `DirectorBrief.mood`, `reel_energy`, creator/social fields
- `motion` -> `DirectorBrief.motion`
- `temporal` -> DirectorBrief temporal fields
- `audio` -> `DirectorBrief.audio`, `dialogue`, audio fields
- `emotion` -> DirectorBrief creator/emotion/social fields
- `finish` -> `DirectorBrief.visual_goal`, visual focus fields

## Fields Unique To PromptComponents

No field appears to provide unique downstream prompt value as currently wired.

The only unique aspect is shape:

- PromptComponents provides broad bucket names matching profile structure categories.

But because `profileAssembly` and `platformWriterOutput` are not serialized into the final Stage 2 prompt, that shape does not currently influence Gemini prompt generation directly.

## Assessment

`PromptComponents` currently behaves more like a convenience aggregation layer than a required orchestration layer.

Its main theoretical purpose is profile-based assembly, but the assembled result does not survive into the final Stage 2 prompt. In addition, overlapping fields are overwritten by `DirectorBrief` before profile assembly:

```js
const briefComponents = directorBrief ? {...promptComponents, ...directorBrief} : promptComponents;
```

This means PromptComponents contributes little direct value to final platform prompt generation in the current pipeline.

No removal is recommended from this report alone, but it is a strong candidate for runtime validation or future simplification.
