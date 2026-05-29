# DirectorBrief Usage Report

Date: 2026-05-29

Scope:

- `buildDirectorBrief()`
- downstream consumers in Stage 2 prompt assembly
- refinement, rewrite, polish, and validation systems

Source file:

- `backend/analyzer.js`

No code was changed for this report.

## Executive Summary

`buildDirectorBrief()` produces 68 fields.

The highest-value fields are the core generation fields:

- `subject`
- `action`
- `camera`
- `lighting`
- `environment`
- `motion`
- `mood`
- `audio`
- `visual_goal`
- `generation_intent`

These are consumed by multiple systems:

- `compressStage2Assembly()`
- final Stage 2 prompt
- prompt refinement/rewrite systems
- validation/scoring systems
- master prompt generation

The clearest write-only or low-value fields are:

- `scene`
- `audio_role`
- `viewer_feeling`
- `music_sync_energy`
- `motion_style`
- `movement_density`
- `beat_sync_strength`
- `performance_intensity`
- `movement_continuity`
- `motion_focus`
- `social_platform_style`

These are generated in DirectorBrief but are not directly referenced downstream as `brief.<field>`.

Important distinction:

- Several fields not read directly from `DirectorBrief` may already be folded into large aggregate fields such as `reel_energy`, `motion`, `visual_goal`, or `generation_intent`.
- That means some fields are not necessarily useless conceptually, but their individual DirectorBrief copies are not consumed.

## Consumer Groups

### Final Stage2 Prompt Consumers

`compressStage2Assembly()` serializes a reduced `brief` object into `DIRECTOR_BRIEF:` with these fields:

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

`buildAudioPromptGuidance()` also reads:

- `audio_type`
- `dialogue`
- `dialogue_summary`
- `music_mood`
- `ambient_audio`

and writes derived text into `AUDIO_GUIDANCE:`.

### Refinement Consumers

Refinement/rewrite systems read these DirectorBrief fields:

- `subject`
- `action`
- `generation_intent`
- `camera`
- `lighting`
- `environment`
- `motion`
- `mood`
- `audio`
- `visual_goal`
- `dialogue`
- `dialogue_summary`
- `speech_delivery_style`
- `microphone_importance`

Relevant functions:

- `critiquePrompt()`
- `rewritePromptFromCritique()`
- `evaluatePromptQuality()`
- `rewritePrompt()`
- `finalPromptPolish()`
- `strengthenCreatorPerformanceLanguage()`

### Validation Consumers

Validation/scoring systems read these fields:

- `speech_delivery_style`
- `microphone_importance`
- `subject`
- `action`
- `motion`
- `environment`
- `audio`
- `dialogue`

Relevant functions:

- `validateCreatorPerformancePrompt()`
- `critiquePrompt()`
- `evaluatePromptQuality()`

### Master Prompt Consumers

`buildMasterPromptFromBrief()` reads many more fields than platform Stage 2 generation does. This matters for `master_prompt`, but it is separate from Gemini platform prompt generation.

## Field Usage Matrix

| Field Name | Source | Consumers | Used In Final Prompt | Used In Validation | Used In Refinement | Write-Only |
|---|---|---|---|---|---|---|
| `subject` | subject fallback from creator label, archetype, objects, subjects, shot plan | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `critiquePrompt`, `rewritePromptFromCritique`, `evaluatePromptQuality`, `rewritePrompt`, `strengthenCreatorPerformanceLanguage` | Yes | Yes | Yes | No |
| `scene` | semantic scene, reel type, content type | None as `brief.scene` | No | No | No | Yes |
| `action` | silence/action abstraction, creator intent, shot plan, pose action | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `critiquePrompt`, `rewritePromptFromCritique`, `evaluatePromptQuality`, `rewritePrompt` | Yes | Yes | Yes | No |
| `camera` | social camera, shot plan, camera grammar, camera motion | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `rewritePromptFromCritique`, `rewritePrompt` | Yes | No | Yes | No |
| `lighting` | `factual.lighting` | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `rewritePromptFromCritique`, `rewritePrompt` | Yes | No | Yes | No |
| `environment` | shot plan environment response, environment, surfaces | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `rewritePromptFromCritique`, `evaluatePromptQuality`, `rewritePrompt` | Yes | Yes | Yes | No |
| `mood` | mood atmosphere, audience intent | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `rewritePromptFromCritique`, `rewritePrompt` | Yes | No | Yes | No |
| `motion` | subject/environment motion, motion energy, temporal, attention, creator intent, micro-motion | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `critiquePrompt`, `rewritePromptFromCritique`, `evaluatePromptQuality`, `rewritePrompt` | Yes | Yes | Yes | No |
| `creator_performance_mode` | `deriveCreatorPerformanceMode()` | `compressStage2Assembly`, `buildMasterPromptFromBrief` | Yes | No | No | No |
| `speech_delivery_style` | `deriveCreatorPerformanceMode()` | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `strengthenCreatorPerformanceLanguage`, `validateCreatorPerformancePrompt` | Yes | Yes | Yes | No |
| `audience_connection` | `deriveCreatorPerformanceMode()` | `compressStage2Assembly`, `buildMasterPromptFromBrief` | Yes | No | No | No |
| `creator_energy` | `deriveCreatorPerformanceMode()` | `compressStage2Assembly`, `buildMasterPromptFromBrief` | Yes | No | No | No |
| `conversation_presence` | `deriveCreatorPerformanceMode()` | `compressStage2Assembly`, `buildMasterPromptFromBrief` | Yes | No | No | No |
| `microphone_importance` | `deriveCreatorPerformanceMode()` | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `strengthenCreatorPerformanceLanguage`, `validateCreatorPerformancePrompt` | Yes | Yes | Yes | No |
| `reel_energy` | aggregated reel/social/motion/creator/temporal/attention fields | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `performance_style` | `factual.performance_style` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `social_aesthetic` | `factual.social_aesthetic` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `motion_style` | `factual.motion_style` | None as `brief.motion_style` | No | No | No | Yes |
| `viewer_feeling` | `factual.viewer_feeling` | None as `brief.viewer_feeling` | No | No | No | Yes |
| `camera_presence` | `factual.camera_presence` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `music_sync_energy` | `factual.music_sync_energy` | None as `brief.music_sync_energy` | No | No | No | Yes |
| `dance_energy` | `factual.dance_energy` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `movement_density` | `factual.movement_density` | None as `brief.movement_density` | No | No | No | Yes |
| `motion_rhythm` | `factual.motion_rhythm` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `body_motion_style` | `factual.body_motion_style` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `beat_sync_strength` | `factual.beat_sync_strength` | None as `brief.beat_sync_strength` | No | No | No | Yes |
| `performance_intensity` | `factual.performance_intensity` | None as `brief.performance_intensity` | No | No | No | Yes |
| `camera_engagement` | `factual.camera_engagement` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `movement_continuity` | `factual.movement_continuity` | None as `brief.movement_continuity` | No | No | No | Yes |
| `motion_focus` | `factual.motion_focus` | None as `brief.motion_focus` | No | No | No | Yes |
| `creator_archetype` | `factual.creator_archetype` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `creator_presence` | `factual.creator_presence` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `content_personality` | `factual.content_personality` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `social_platform_style` | `factual.social_platform_style` | None as `brief.social_platform_style` | No | No | No | Yes |
| `presentation_style` | `factual.presentation_style` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `viewer_relationship` | `factual.viewer_relationship` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `creator_intent` | creator intent helper or factual field | `buildMasterPromptFromBrief`, `alignSentenceRhythm` | No for platform Stage2, Yes for master prompt | No | Yes | No |
| `social_behavior` | creator intent helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `pose_rhythm` | creator intent helper or factual field | `buildMasterPromptFromBrief`, `alignSentenceRhythm` | No for platform Stage2, Yes for master prompt | No | Yes | No |
| `performance_pattern` | creator intent helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `creator_confidence` | creator intent helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `viewer_hook_style` | creator intent helper or factual field | `buildMasterPromptFromBrief`, `alignSentenceRhythm` | No for platform Stage2, Yes for master prompt | No | Yes | No |
| `camera_style` | social camera helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `camera_energy` | social camera helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `camera_relationship` | social camera helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `viewer_perspective` | social camera helper or factual field | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `temporal_opening` | `factual.temporal_opening` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `temporal_progression` | `factual.temporal_progression` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `temporal_continuity` | `factual.temporal_continuity` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `moment_flow` | `factual.moment_flow` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `scene_evolution` | `factual.scene_evolution` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `performance_progression` | `factual.performance_progression` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `primary_visual_focus` | `factual.primary_visual_focus` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `secondary_visual_focus` | `factual.secondary_visual_focus` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `attention_progression` | `factual.attention_progression` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `focus_transition` | `factual.focus_transition` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `camera_intention` | `factual.camera_intention` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `visual_priority_flow` | `factual.visual_priority_flow` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `dialogue` | audio type, speech language, dialogue summary, spoken topic | `buildAudioPromptGuidance`, `critiquePrompt`, `evaluatePromptQuality` | Yes, through `AUDIO_GUIDANCE` when relevant | Yes | Yes | No |
| `audio` | audio type, audio role, dialogue, music, ambient, silence | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `critiquePrompt`, `rewritePromptFromCritique`, `evaluatePromptQuality`, `rewritePrompt` | Yes | Yes | Yes | No |
| `audio_type` | `factual.audio_type` | `buildAudioPromptGuidance` | Yes, through `AUDIO_GUIDANCE` when relevant | No | No | No |
| `silence_direction` | `resolveSilenceDirection(factual)` | `buildMasterPromptFromBrief` | No for platform Stage2, Yes for master prompt | No | No | No |
| `audio_role` | `factual.audio_role` | None as `brief.audio_role` | No | No | No | Yes |
| `dialogue_summary` | `factual.dialogue_summary` | `buildAudioPromptGuidance`, `strengthenCreatorPerformanceLanguage` | Yes, through `AUDIO_GUIDANCE` when relevant | No | Yes | No |
| `music_mood` | `factual.music_mood` | `buildAudioPromptGuidance` | Yes, through `AUDIO_GUIDANCE` when relevant | No | No | No |
| `ambient_audio` | `factual.ambient_audio` | `buildAudioPromptGuidance` | Yes, through `AUDIO_GUIDANCE` when relevant | No | No | No |
| `visual_goal` | creator performance, reel energy, creator intent, social camera, object/OCR fields, shot plan finish | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `rewritePromptFromCritique`, `rewritePrompt` | Yes | No | Yes | No |
| `generation_intent` | creator energy, speech style, reel/motion/social/temporal/attention/workflow fields | `compressStage2Assembly`, `buildMasterPromptFromBrief`, `rewritePromptFromCritique`, `rewritePrompt` | Yes | No | Yes | No |

## Fields Actually Serialized Into Final Stage2 Prompt

These fields are included in `DIRECTOR_BRIEF:` by `compressStage2Assembly()`:

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

These fields can also influence `AUDIO_GUIDANCE:`:

- `audio_type`
- `dialogue`
- `dialogue_summary`
- `music_mood`
- `ambient_audio`

## Fields Used Only Outside Platform Stage2 Prompt

These fields are consumed by `buildMasterPromptFromBrief()` but are not serialized into the Gemini platform Stage2 prompt as individual DirectorBrief fields:

- `reel_energy`
- `performance_style`
- `social_aesthetic`
- `camera_presence`
- `dance_energy`
- `motion_rhythm`
- `body_motion_style`
- `camera_engagement`
- `creator_archetype`
- `creator_presence`
- `content_personality`
- `presentation_style`
- `viewer_relationship`
- `social_behavior`
- `performance_pattern`
- `creator_confidence`
- `camera_style`
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
- `silence_direction`

These can be high-value for `master_prompt`, but they do not directly survive into generated platform prompt assembly unless folded into `motion`, `visual_goal`, or `generation_intent`.

## Fields Never Consumed As DirectorBrief Fields

These fields are produced by `buildDirectorBrief()` but have no downstream `brief.<field>` references:

- `scene`
- `motion_style`
- `viewer_feeling`
- `music_sync_energy`
- `movement_density`
- `beat_sync_strength`
- `performance_intensity`
- `movement_continuity`
- `motion_focus`
- `social_platform_style`
- `audio_role`

Some of these values may already be folded into aggregate fields such as `motion`, `reel_energy`, `visual_goal`, or `generation_intent`, but the individual DirectorBrief fields are write-only.

## Fields Consumed Only Indirectly

These fields are not serialized directly into the platform Stage2 prompt but may influence final returned platform prompts through refinement, rewrite, polish, or validation:

- `creator_intent`
- `pose_rhythm`
- `viewer_hook_style`
- `dialogue`
- `dialogue_summary`
- `speech_delivery_style`
- `microphone_importance`

## Fields That Duplicate PromptComponents

Strong duplicates with `buildPromptComponents()`:

- `subject` duplicates `PromptComponents.subject`
- `action` duplicates `PromptComponents.action`
- `camera` duplicates `PromptComponents.camera`
- `lighting` duplicates `PromptComponents.lighting`
- `environment` duplicates `PromptComponents.environment`
- `motion` duplicates `PromptComponents.motion` and partly `PromptComponents.temporal`
- `mood`, `reel_energy`, and creator/social fields duplicate `PromptComponents.atmosphere` / `PromptComponents.emotion`
- `audio`, `dialogue`, and audio fields duplicate `PromptComponents.audio`
- `visual_goal` and visual focus fields duplicate `PromptComponents.finish`
- `generation_intent` duplicates mixed `PromptComponents.action`, `temporal`, `atmosphere`, and `finish` concepts

## Totals

| Category | Count |
|---|---:|
| Total fields produced by `buildDirectorBrief()` | 68 |
| Fields serialized into final platform Stage2 prompt via `DIRECTOR_BRIEF` | 16 |
| Additional fields influencing final Stage2 prompt via `AUDIO_GUIDANCE` | 5 |
| Fields consumed by refinement/rewrite/polish systems | 18 |
| Fields consumed by validation/scoring systems | 8 |
| Fields consumed by `master_prompt` generation | 48 |
| Fields never consumed directly as `brief.<field>` | 11 |

## Assessment

`DirectorBrief` is not purely dead aggregation. It is a high-value orchestration object for:

- final Stage2 platform prompt assembly core fields
- audio guidance
- prompt refinement/rewrite
- validation/scoring
- master prompt generation

However, it is also oversized for platform prompt generation. The generated platform prompt path directly needs a much smaller subset than the full 68-field object.

Most likely high-value fields:

- `subject`
- `action`
- `camera`
- `lighting`
- `environment`
- `motion`
- `audio`
- `visual_goal`
- `generation_intent`
- creator-performance microphone/speech fields

Most likely low-value as standalone DirectorBrief fields:

- `scene`
- `audio_role`
- `motion_style`
- `viewer_feeling`
- `music_sync_energy`
- `movement_density`
- `beat_sync_strength`
- `performance_intensity`
- `movement_continuity`
- `motion_focus`
- `social_platform_style`

No removal is recommended from this report alone. Runtime traces should confirm whether the low-value fields ever meaningfully affect prompt quality through aggregate fields before any refactor.
