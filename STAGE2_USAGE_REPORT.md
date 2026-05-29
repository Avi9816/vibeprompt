# Stage 2 Usage Report

Date: 2026-05-29

Scope:

- `buildStage2Context()`
- Downstream usage in `compressStage2Assembly()`
- Final Stage 2 prompt assembly for modern video platforms

Source file:

- `backend/analyzer.js`

No code was changed for this report.

## Executive Summary

`buildStage2Context()` creates a broad `compactContext` object with 63 top-level fields. Downstream prompt assembly does **not** serialize this full object.

The only direct consumer is `compressStage2Assembly()`, which extracts a much smaller `minimalContext`:

```js
content_type
reel_type
creator_archetype
reel_energy
dance_energy
creator_intent
pose_rhythm
camera_style
primary_object
hero_element
overlay_topic
spoken_topic
speech_language
audio_type
```

Everything else in `buildStage2Context()` is currently write-only from the perspective of final Stage 2 prompt assembly.

Important distinction:

- `directorBrief`, `shotPlan`, and `promptSlots` do reach the final Stage 2 prompt, but they are passed separately into `compressStage2Assembly()`.
- The nested copies inside `compactContext`:
  - `director_brief`
  - `prompt_components`
  - `shot_plan`
  - `prompt_slots`

  are not used downstream.

## Downstream Call Path

1. `buildPlatformPrompt()`
2. `buildStage2Context(...)`
3. `compactContext.speech_language` is read once for the separate `SPEECH_LANGUAGE:` prompt section.
4. `compactContext` is passed to `compressStage2Assembly(...)`.
5. `compressStage2Assembly()` builds `minimalContext` from selected `compactContext` fields.
6. `minimalContext` is serialized into the final Stage 2 prompt under `COMPACT_CONTEXT:`.
7. Gemini may use those fields to produce the generated platform prompt.

## Usage Legend

| Value | Meaning |
|---|---|
| Yes | Field is directly serialized into the final Stage 2 prompt |
| No | Field is not serialized into the final Stage 2 prompt |
| Indirect | Same information may influence another structure, but this Stage2Context field is not itself consumed |
| Diagnostics | Field appears only in tracing/logging or internal visibility, not prompt content |
| Write-only | Field is created but never read downstream |

## Field Usage Matrix

| Field Name | Source | Consumers | Used In Final Prompt? | Used Only For Diagnostics? | Used Only Indirectly? |
|---|---|---|---|---|---|
| `content_type` | `factual.content_type` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `reel_type` | `factual.reel_type` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `scene_purpose` | `factual.scene_purpose` | None after creation | No | No | Yes, via separate `directorBrief.scene` if present |
| `activity_context` | `factual.activity_context` | None after creation | No | No | Yes, via separate `directorBrief.scene` if present |
| `content_theme` | `factual.content_theme` | None after creation | No | No | Yes, via separate `directorBrief.scene` if present |
| `reel_energy` | `factual.reel_energy` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `performance_style` | `factual.performance_style` | None after creation | No | No | Yes, via separate `directorBrief.performance_style` / `promptComponents.temporal` |
| `social_aesthetic` | `factual.social_aesthetic` | None after creation | No | No | Yes, via separate `directorBrief.social_aesthetic` / `promptComponents.atmosphere` |
| `motion_style` | `factual.motion_style` | None after creation | No | No | Yes, via separate `directorBrief.motion_style` / `promptComponents.motion` |
| `viewer_feeling` | `factual.viewer_feeling` | None after creation | No | No | Yes, via separate `directorBrief.viewer_feeling` |
| `camera_presence` | `factual.camera_presence` | None after creation | No | No | Yes, via separate `directorBrief.camera_presence` |
| `music_sync_energy` | `factual.music_sync_energy` | None after creation | No | No | Yes, via separate `directorBrief.music_sync_energy` |
| `dance_energy` | `factual.dance_energy` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `movement_density` | `factual.movement_density` | None after creation | No | No | Yes, via separate `directorBrief.movement_density` / `promptComponents.motion` |
| `motion_rhythm` | `factual.motion_rhythm` | None after creation | No | No | Yes, via separate `directorBrief.motion_rhythm` / `promptComponents.motion` |
| `body_motion_style` | `factual.body_motion_style` | None after creation | No | No | Yes, via separate `directorBrief.body_motion_style` |
| `beat_sync_strength` | `factual.beat_sync_strength` | None after creation | No | No | Yes, via separate `directorBrief.beat_sync_strength` |
| `performance_intensity` | `factual.performance_intensity` | None after creation | No | No | Yes, via separate `directorBrief.performance_intensity` |
| `camera_engagement` | `factual.camera_engagement` | None after creation | No | No | Yes, via separate `directorBrief.camera_engagement` |
| `movement_continuity` | `factual.movement_continuity` | None after creation | No | No | Yes, via separate `directorBrief.movement_continuity` |
| `motion_focus` | `factual.motion_focus` | None after creation | No | No | Yes, via separate `directorBrief.motion_focus` |
| `creator_archetype` | `factual.creator_archetype` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `creator_presence` | `factual.creator_presence` | None after creation | No | No | Yes, via separate `directorBrief.creator_presence` |
| `content_personality` | `factual.content_personality` | None after creation | No | No | Yes, via separate `directorBrief.content_personality` |
| `social_platform_style` | `factual.social_platform_style` | None after creation | No | No | Yes, via separate `directorBrief.social_platform_style` |
| `presentation_style` | `factual.presentation_style` | None after creation | No | No | Yes, via separate `directorBrief.presentation_style` |
| `viewer_relationship` | `factual.viewer_relationship` | None after creation | No | No | Yes, via separate `directorBrief.viewer_relationship` |
| `creator_intent` | `factual.creator_intent` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `social_behavior` | `factual.social_behavior` | None after creation | No | No | Yes, via separate `directorBrief.social_behavior` / `promptComponents.motion` |
| `pose_rhythm` | `factual.pose_rhythm` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `performance_pattern` | `factual.performance_pattern` | None after creation | No | No | Yes, via separate `directorBrief.performance_pattern` / `promptComponents.action` |
| `creator_confidence` | `factual.creator_confidence` | None after creation | No | No | Yes, via separate `directorBrief.creator_confidence` |
| `viewer_hook_style` | `factual.viewer_hook_style` | None after creation | No | No | Yes, via separate `directorBrief.viewer_hook_style` |
| `camera_style` | `socialCamera.camera_style` or `factual.camera_style` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `camera_energy` | `socialCamera.camera_energy` or `factual.camera_energy` | None after creation | No | No | Yes, via separate `directorBrief.camera_energy` / `promptComponents.camera` |
| `camera_relationship` | `socialCamera.camera_relationship` or `factual.camera_relationship` | None after creation | No | No | Yes, via separate `directorBrief.camera_relationship` |
| `viewer_perspective` | `socialCamera.viewer_perspective` or `factual.viewer_perspective` | None after creation | No | No | Yes, via separate `directorBrief.viewer_perspective` |
| `temporal_opening` | `factual.temporal_opening` | None after creation | No | No | Yes, via separate `directorBrief.temporal_opening` |
| `temporal_progression` | `factual.temporal_progression` | None after creation | No | No | Yes, via separate `directorBrief.temporal_progression` / `promptComponents.temporal` |
| `temporal_continuity` | `factual.temporal_continuity` | None after creation | No | No | Yes, via separate `directorBrief.temporal_continuity` |
| `moment_flow` | `factual.moment_flow` | None after creation | No | No | Yes, via separate `directorBrief.moment_flow` |
| `scene_evolution` | `factual.scene_evolution` | None after creation | No | No | Yes, via separate `directorBrief.scene_evolution` |
| `performance_progression` | `factual.performance_progression` | None after creation | No | No | Yes, via separate `directorBrief.performance_progression` |
| `primary_visual_focus` | `factual.primary_visual_focus` | None after creation | No | No | Yes, via separate `directorBrief.primary_visual_focus` / `promptComponents.finish` |
| `secondary_visual_focus` | `factual.secondary_visual_focus` | None after creation | No | No | Yes, via separate `directorBrief.secondary_visual_focus` |
| `attention_progression` | `factual.attention_progression` | None after creation | No | No | Yes, via separate `directorBrief.attention_progression` |
| `focus_transition` | `factual.focus_transition` | None after creation | No | No | Yes, via separate `directorBrief.focus_transition` |
| `camera_intention` | `factual.camera_intention` | None after creation | No | No | Yes, via separate `directorBrief.camera_intention` / `promptComponents.camera` |
| `visual_priority_flow` | `factual.visual_priority_flow` | None after creation | No | No | Yes, via separate `directorBrief.visual_priority_flow` |
| `overlay_topic` | `factual.overlay_topic` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `spoken_topic` | `factual.spoken_topic` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `speech_language` | `factual.speech_language` | `buildPlatformPrompt()` speech propagation, `compressStage2Assembly().minimalContext`, separate `SPEECH_LANGUAGE` section | Yes, `COMPACT_CONTEXT` and `SPEECH_LANGUAGE` | No | No |
| `audio_type` | `factual.audio_type` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `audio_role` | `factual.audio_role` | None after creation | No | No | Yes, via separate `directorBrief.audio_role/audio` |
| `dialogue_summary` | `factual.dialogue_summary` | None after creation | No | No | Yes, via separate `directorBrief.dialogue_summary/audio` |
| `music_mood` | `factual.music_mood` | None after creation | No | No | Yes, via separate `directorBrief.music_mood/audio` |
| `ambient_audio` | `factual.ambient_audio` | None after creation | No | No | Yes, via separate `directorBrief.ambient_audio/audio` |
| `primary_object` | `factual.primary_object` via `rewriteSlotLanguage()` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `hero_element` | `factual.hero_element` via `rewriteSlotLanguage()` | `compressStage2Assembly().minimalContext` | Yes, `COMPACT_CONTEXT` | No | No |
| `director_brief` | `directorBrief` argument | None after creation as nested Stage2Context field | No | No | Yes, separate `directorBrief` argument is used |
| `prompt_components` | `promptComponents` argument | None after creation as nested Stage2Context field | No | No | Yes, separate components are used before context creation |
| `shot_plan` | `shotPlan` argument | None after creation as nested Stage2Context field | No | No | Yes, separate `shotPlan` argument is used |
| `prompt_slots` | `promptSlots` argument | None after creation as nested Stage2Context field | No | No | Yes, separate `promptSlots` argument is used |

## Final Prompt Reach

### Reaches DirectorPrompt

No `buildStage2Context()` fields reach `DIRECTOR_PROMPT`.

Reason: `buildDirectorPrompt()` runs before `buildStage2Context()` and receives `factual`, `platformProfile`, and `platformTemplate`, not `compactContext`.

### Reaches PlatformTemplate

No `buildStage2Context()` fields reach `PLATFORM_TEMPLATE`.

Reason: `buildPlatformPromptTemplate()` runs before `buildStage2Context()` and receives context objects directly, not `compactContext`.

### Reaches PromptSlots

No `buildStage2Context()` fields reach `PROMPT_SLOTS`.

Reason: `buildPromptSlots()` runs before `buildStage2Context()` and receives `shotPlan`, `factual`, and `stage2Scope`.

### Reaches Final Stage2 Prompt

Only these Stage2Context fields reach the final Stage2 prompt:

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

Additionally, `speech_language` is separately copied into the `SPEECH_LANGUAGE:` section.

### Reaches Generated Platform Prompt

The fields above may influence generated platform prompts because they are serialized into the Gemini prompt. This is indirect and model-dependent.

Fields not serialized into the final Stage2 prompt cannot influence the generated platform prompt through `COMPACT_CONTEXT`.

They may still influence generation through separate structures such as `DIRECTOR_BRIEF`, `SHOT_PLAN`, or `PROMPT_SLOTS`.

## Nested Structure Usage

### `director_brief`

| Metric | Value |
|---|---:|
| Total fields in structure | 68 |
| Fields consumed directly by `compressStage2Assembly()` through separate `directorBrief` argument | 16 |
| Fields consumed by post-generation refinement/validation through `promptAssemblyContextCache.brief` | Many, function-dependent |
| Fields consumed through `compactContext.director_brief` | 0 |
| Fields duplicated by top-level context | Most social/camera/temporal/audio fields |

`compressStage2Assembly()` keeps only:

- `subject`
- `action`
- `camera`
- `motion`
- `lighting`
- `environment`
- `mood`
- `audio`
- `visual_goal`
- `generation_intent`
- `creator_performance_mode`
- `speech_delivery_style`
- `audience_connection`
- `creator_energy`
- `conversation_presence`
- `microphone_importance`

The nested `compactContext.director_brief` copy is never read.

### `prompt_components`

| Metric | Value |
|---|---:|
| Total fields in structure | 11 |
| Fields consumed downstream through `compactContext.prompt_components` | 0 |
| Fields consumed before context creation | Used by `assemblePromptFromProfile()` and `writePlatformStyle()` |
| Fields never consumed after Stage2Context creation | 11 |
| Fields duplicated by top-level context | Most component source facts |

Fields:

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

`compactJson()` also explicitly prunes `prompt_components` if it encounters that key inside an object.

### `shot_plan`

| Metric | Value |
|---|---:|
| Total fields in structure | 6 |
| Fields consumed directly by final prompt through separate `shotPlan` argument | 6 |
| Fields consumed through `compactContext shot_plan` | 0 |
| Fields duplicated by top-level context | Several subject/action/camera/environment concepts |

Fields:

- `opening_visual`
- `primary_action`
- `secondary_motion`
- `camera_behavior`
- `environment_response`
- `visual_finish`

The separate `shotPlan` argument reaches `SHOT_PLAN:` in the final Stage2 prompt. The nested `compactContext.shot_plan` copy does not.

### `prompt_slots`

| Metric | Value |
|---|---:|
| Total top-level fields in structure | 4 |
| Fields consumed directly by final prompt through separate `promptSlots` argument | 4 |
| Fields consumed through `compactContext.prompt_slots` | 0 |
| Fields duplicated by top-level context | Slot values duplicate shot plan values |

Top-level fields:

- `platform`
- `content_type`
- `slotOrder`
- `populatedSlots`

The separate `promptSlots` argument reaches `PROMPT_SLOTS:` in the final Stage2 prompt. The nested `compactContext.prompt_slots` copy does not.

## Dead / Write-Only Fields

These Stage2Context top-level fields are created but not read by `compressStage2Assembly()`:

- `scene_purpose`
- `activity_context`
- `content_theme`
- `performance_style`
- `social_aesthetic`
- `motion_style`
- `viewer_feeling`
- `camera_presence`
- `music_sync_energy`
- `movement_density`
- `motion_rhythm`
- `body_motion_style`
- `beat_sync_strength`
- `performance_intensity`
- `camera_engagement`
- `movement_continuity`
- `motion_focus`
- `creator_presence`
- `content_personality`
- `social_platform_style`
- `presentation_style`
- `viewer_relationship`
- `social_behavior`
- `performance_pattern`
- `creator_confidence`
- `viewer_hook_style`
- `camera_energy`
- `camera_relationship`
- `viewer_perspective`
- `temporal_opening`
- `temporal_progression`
- `temporal_continuity`
- `moment_flow`
- `scene_evolution`
- `performance_progression`
- `primary_visual_focus`
- `secondary_visual_focus`
- `attention_progression`
- `focus_transition`
- `camera_intention`
- `visual_priority_flow`
- `audio_role`
- `dialogue_summary`
- `music_mood`
- `ambient_audio`

These may still affect the final prompt through other structures, especially `directorBrief`, but the Stage2Context copies are write-only.

## Duplicated Fields Never Referenced After Creation

The following nested copies are duplicated and never read after creation:

- `compactContext.director_brief`
- `compactContext.prompt_components`
- `compactContext.shot_plan`
- `compactContext.prompt_slots`

This is the clearest structural duplication in Stage 2.

## Highest-Risk Redundancy Areas

1. `buildStage2Context()` top-level social and motion fields duplicate `directorBrief` fields.
2. `buildStage2Context()` top-level camera fields duplicate `directorBrief.camera*`, `promptComponents.camera`, and `shotPlan.camera_behavior`.
3. `buildStage2Context()` top-level audio fields duplicate `directorBrief.audio/dialogue` and `promptComponents.audio`, but most are not serialized into final `COMPACT_CONTEXT`.
4. Nested `director_brief`, `prompt_components`, `shot_plan`, and `prompt_slots` are copied into Stage2Context but ignored because `compressStage2Assembly()` receives the original structures separately.

## Practical Finding

Most useful Stage2Context signal that survives to the final Stage2 prompt is concentrated in 14 fields:

- content/category
- creator/reel energy
- a small amount of camera/object/audio/OCR/speech context

The majority of `buildStage2Context()` is currently either:

- indirectly redundant with `DIRECTOR_BRIEF`, `SHOT_PLAN`, or `PROMPT_SLOTS`, or
- write-only after context creation.

No removal or refactor is recommended here yet. This report only identifies usage and survival through the final Stage2 prompt path.
