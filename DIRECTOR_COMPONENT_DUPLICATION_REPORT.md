# Director / Components / Stage2 Context Duplication Report

Date: 2026-05-29

Scope:

- `buildDirectorBrief()`
- `buildPromptComponents()`
- `buildStage2Context()`

Source file:

- `backend/analyzer.js`

No code was changed for this report.

## Duplicate Score Key

| Score | Meaning |
|---:|---|
| 5 | Exact or effectively verbatim duplication, including nested embedding |
| 4 | Near duplicate: same source facts with light cleaning/rewriting |
| 3 | Conceptual duplicate: same semantic role, different aggregation |
| 2 | Partial overlap |
| 1 | Mostly unique |

## Executive Summary

`buildPromptComponents()` and `buildDirectorBrief()` carry strongly overlapping information, but at different granularity:

- `buildPromptComponents()` groups facts into reusable broad buckets: `subject`, `action`, `camera`, `environment`, `lighting`, `atmosphere`, `motion`, `temporal`, `audio`, `emotion`, `finish`.
- `buildDirectorBrief()` creates a larger director-facing object with both broad fields and many fine-grained social/video intelligence fields.
- `buildStage2Context()` duplicates both approaches: it stores many top-level clean facts, then embeds `director_brief`, `prompt_components`, `shot_plan`, and `prompt_slots`.

The highest duplication comes from `buildStage2Context()` because it includes:

```js
director_brief: directorBrief
prompt_components: promptComponents
shot_plan: shotPlan
prompt_slots: promptSlots
```

while also repeating many of the same source fields at top level.

## Function Roles

| Function | Role | Output Shape |
|---|---|---|
| `buildDirectorBrief()` | Platform-neutral director brief for final prompt writing | Detailed object with subject/action/camera/audio/social/video intelligence fields |
| `buildPromptComponents()` | Broad reusable component buckets for profile-based assembly | 11 grouped component strings |
| `buildStage2Context()` | Compact Stage 2 payload context | Top-level facts plus nested `director_brief`, `prompt_components`, `shot_plan`, `prompt_slots` |

## buildDirectorBrief() Fields

| Field Name | Origin | Appears In | Transformation Applied | Duplicate Score |
|---|---|---|---|---:|
| `subject` | `creatorSubjectLabel()`, `creator_archetype`, `hero_element`, `primary_object`, `product_identity`, `food_focus`, `subjects`, `shotPlan.opening_visual` | DirectorBrief, PromptComponents.subject, Stage2Context via `director_brief` | Priority fallback + `rewriteSlotLanguage()` | 4 |
| `scene` | `scene_purpose`, `activity_context`, `content_theme`, `reel_type`, `content_type` | DirectorBrief, Stage2Context top-level scene fields | Semantic aggregation + `rewriteSlotLanguage()` | 4 |
| `action` | `silenceDirection`, action abstraction, creator intent, `shotPlan.primary_action`, `pose_action` | DirectorBrief, PromptComponents.action, ShotPlan.primary_action, Stage2Context via nested objects | Priority fallback + social-motion translation | 4 |
| `camera` | `socialCamera.camera_style`, `shotPlan.camera_behavior`, `cameraGrammar.cameraMotion`, `camera_motion` | DirectorBrief, PromptComponents.camera, Stage2Context camera fields, ShotPlan.camera_behavior | Priority fallback + `rewriteSlotLanguage()` | 4 |
| `lighting` | `factual.lighting` | DirectorBrief, PromptComponents.lighting, Stage2Context via nested brief/components | `rewriteSlotLanguage()` | 4 |
| `environment` | `shotPlan.environment_response`, `environment`, `surfaces` | DirectorBrief, PromptComponents.environment, Stage2Context via nested brief/components, ShotPlan.environment_response | Priority fallback + `rewriteSlotLanguage()` | 4 |
| `mood` | `mood_atmosphere`, `audience_intent` | DirectorBrief, PromptComponents.atmosphere/emotion | `rewriteSlotLanguage()` | 3 |
| `motion` | `subject_motion`, `visible_motion_cues`, `environmental_motion`, motion/social/temporal fields, creator intent, social camera energy, `microMotion.generated_layer` | DirectorBrief, PromptComponents.motion, PromptComponents.temporal, ShotPlan.secondary_motion | Large aggregation + social-motion translation | 4 |
| `creator_performance_mode` | `deriveCreatorPerformanceMode()` | DirectorBrief only, indirectly PromptComponents through related source fields | Newly derived helper output | 2 |
| `speech_delivery_style` | `deriveCreatorPerformanceMode()` | DirectorBrief only, audio-related prompt paths | Newly derived helper output | 2 |
| `audience_connection` | `deriveCreatorPerformanceMode()` | DirectorBrief, visual_goal aggregation | Newly derived helper output | 2 |
| `creator_energy` | `deriveCreatorPerformanceMode()` | DirectorBrief, generation_intent aggregation | Newly derived helper output | 2 |
| `conversation_presence` | `deriveCreatorPerformanceMode()` | DirectorBrief, master prompt usage | Newly derived helper output | 2 |
| `microphone_importance` | `deriveCreatorPerformanceMode()` | DirectorBrief, visual_goal aggregation | Newly derived helper output | 2 |
| `reel_energy` | `reel_energy`, performance, social, motion, creator, temporal, attention, camera fields | DirectorBrief, Stage2Context top-level `reel_energy`, PromptComponents.atmosphere | Large aggregation into one field | 3 |
| `performance_style` | `factual.performance_style` | DirectorBrief, PromptComponents.temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `social_aesthetic` | `factual.social_aesthetic` | DirectorBrief, PromptComponents.atmosphere, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `motion_style` | `factual.motion_style` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `viewer_feeling` | `factual.viewer_feeling` | DirectorBrief, PromptComponents.atmosphere/emotion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `camera_presence` | `factual.camera_presence` | DirectorBrief, PromptComponents.emotion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `music_sync_energy` | `factual.music_sync_energy` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `dance_energy` | `factual.dance_energy` | DirectorBrief, PromptComponents.atmosphere/motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `movement_density` | `factual.movement_density` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `motion_rhythm` | `factual.motion_rhythm` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `body_motion_style` | `factual.body_motion_style` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `beat_sync_strength` | `factual.beat_sync_strength` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `performance_intensity` | `factual.performance_intensity` | DirectorBrief, PromptComponents.emotion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `camera_engagement` | `factual.camera_engagement` | DirectorBrief, PromptComponents.emotion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `movement_continuity` | `factual.movement_continuity` | DirectorBrief, PromptComponents.temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `motion_focus` | `factual.motion_focus` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `creator_archetype` | `factual.creator_archetype` | DirectorBrief, PromptComponents.subject/atmosphere, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `creator_presence` | `factual.creator_presence` | DirectorBrief, PromptComponents.emotion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `content_personality` | `factual.content_personality` | DirectorBrief, PromptComponents.atmosphere, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `social_platform_style` | `factual.social_platform_style` | DirectorBrief, PromptComponents.atmosphere, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `presentation_style` | `factual.presentation_style` | DirectorBrief, PromptComponents.action, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `viewer_relationship` | `factual.viewer_relationship` | DirectorBrief, PromptComponents.emotion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `creator_intent` | `creatorIntent.creator_intent` or `factual.creator_intent` | DirectorBrief, PromptComponents.action, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `social_behavior` | `creatorIntent.social_behavior` or `factual.social_behavior` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `pose_rhythm` | `creatorIntent.pose_rhythm` or `factual.pose_rhythm` | DirectorBrief, PromptComponents.motion/temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `performance_pattern` | `creatorIntent.performance_pattern` or `factual.performance_pattern` | DirectorBrief, PromptComponents.action, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `creator_confidence` | `creatorIntent.creator_confidence` or `factual.creator_confidence` | DirectorBrief, PromptComponents.atmosphere, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `viewer_hook_style` | `creatorIntent.viewer_hook_style` or `factual.viewer_hook_style` | DirectorBrief, PromptComponents.atmosphere, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `camera_style` | `socialCamera.camera_style` or `factual.camera_style` | DirectorBrief, PromptComponents.camera, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `camera_energy` | `socialCamera.camera_energy` or `factual.camera_energy` | DirectorBrief, PromptComponents.camera/motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `camera_relationship` | `socialCamera.camera_relationship` or `factual.camera_relationship` | DirectorBrief, PromptComponents.camera, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `viewer_perspective` | `socialCamera.viewer_perspective` or `factual.viewer_perspective` | DirectorBrief, PromptComponents.camera, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `temporal_opening` | `factual.temporal_opening` | DirectorBrief, PromptComponents.temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `temporal_progression` | `factual.temporal_progression` | DirectorBrief, PromptComponents.motion/temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `temporal_continuity` | `factual.temporal_continuity` | DirectorBrief, PromptComponents.motion/temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `moment_flow` | `factual.moment_flow` | DirectorBrief, PromptComponents.temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `scene_evolution` | `factual.scene_evolution` | DirectorBrief, PromptComponents.temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `performance_progression` | `factual.performance_progression` | DirectorBrief, PromptComponents.motion/temporal, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `primary_visual_focus` | `factual.primary_visual_focus` | DirectorBrief, PromptComponents.finish, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `secondary_visual_focus` | `factual.secondary_visual_focus` | DirectorBrief, PromptComponents.finish, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `attention_progression` | `factual.attention_progression` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `focus_transition` | `factual.focus_transition` | DirectorBrief, PromptComponents.motion, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `camera_intention` | `factual.camera_intention` | DirectorBrief, PromptComponents.camera, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `visual_priority_flow` | `factual.visual_priority_flow` | DirectorBrief, PromptComponents.temporal/finish, Stage2Context top-level | `rewriteSlotLanguage()` | 4 |
| `dialogue` | `speech_language`, `dialogue_summary`, `spoken_topic`, `audio_type` | DirectorBrief, PromptComponents.audio, Stage2Context audio fields | Conditional aggregation | 3 |
| `audio` | `audio_type`, `audio_role`, dialogue, music/ambient/silence | DirectorBrief, PromptComponents.audio, Stage2Context audio fields | Conditional aggregation | 3 |
| `audio_type` | `factual.audio_type` | DirectorBrief, Stage2Context top-level | `cleanFact()` fallback to `none` | 5 |
| `silence_direction` | `resolveSilenceDirection(factual)` | DirectorBrief only, can affect action/audio | Newly generated from audio state | 2 |
| `audio_role` | `factual.audio_role` | DirectorBrief, Stage2Context top-level | `cleanFact()` | 5 |
| `dialogue_summary` | `factual.dialogue_summary` | DirectorBrief, PromptComponents.audio, Stage2Context top-level | `cleanFact()` | 5 |
| `music_mood` | `factual.music_mood` | DirectorBrief, PromptComponents.audio, Stage2Context top-level | `cleanFact()` | 5 |
| `ambient_audio` | `factual.ambient_audio` | DirectorBrief, PromptComponents.audio, Stage2Context top-level | `cleanFact()` | 5 |
| `visual_goal` | creator performance, reel energy, creator intent, social camera, object/OCR fields, shotPlan visual finish | DirectorBrief only, overlaps PromptComponents.finish | Aggregated and limited to first two facts | 3 |
| `generation_intent` | creator energy, speech style, reel/motion/social/temporal/attention/workflow fields | DirectorBrief only, overlaps PromptComponents.atmosphere/motion/temporal/emotion | Large aggregation | 3 |

## buildPromptComponents() Fields

| Field Name | Origin | Appears In | Transformation Applied | Duplicate Score |
|---|---|---|---|---:|
| `subject` | `creator_archetype`, `hero_element`, `primary_object`, `product_identity`, `subjects`, `face` | PromptComponents, DirectorBrief.subject, Stage2Context `prompt_components` | Concatenated with `component()` | 4 |
| `action` | `creator_intent`, `performance_pattern`, `presentation_style`, action abstraction, `pose_action` | PromptComponents, DirectorBrief.action, ShotPlan.primary_action | Concatenated broad action bucket | 4 |
| `camera` | `camera_style`, `camera_energy`, `camera_relationship`, `viewer_perspective`, `camera_intention`, `camera_motion`, `lens_feel` | PromptComponents, DirectorBrief.camera, Stage2Context camera fields | Concatenated camera bucket | 4 |
| `environment` | `environment`, `surfaces` | PromptComponents, DirectorBrief.environment, Stage2Context via nested components | Concatenated environment bucket | 4 |
| `lighting` | `lighting` | PromptComponents, DirectorBrief.lighting | Direct copied bucket | 5 |
| `atmosphere` | creator/social/reel/dance/viewer/mood fields | PromptComponents, DirectorBrief reel/creator/mood fields | Concatenated mood/social bucket | 3 |
| `motion` | pose/social/attention/body/motion/subject/environment/music/temporal fields | PromptComponents, DirectorBrief.motion, ShotPlan secondary/primary motion | Concatenated + social-motion translation | 4 |
| `temporal` | temporal fields, movement continuity, pose rhythm, performance style, visible motion, semantic scene fields | PromptComponents, DirectorBrief temporal fields, Stage2Context top-level | Concatenated temporal bucket | 4 |
| `audio` | `audio_type`, speech confidence, `speech_language`, `dialogue_summary`, `spoken_topic`, music/ambient fields | PromptComponents, DirectorBrief.dialogue/audio, Stage2Context audio fields | Conditional aggregation | 3 |
| `emotion` | viewer/creator/performance/camera/mood/speaker intent fields | PromptComponents, DirectorBrief mood/social fields | Concatenated emotional bucket | 3 |
| `finish` | visual focus, lens, color palette, lighting | PromptComponents, DirectorBrief.visual_goal, ShotPlan.visual_finish | Concatenated finish bucket | 3 |

## buildStage2Context() Fields

| Field Name | Origin | Appears In | Transformation Applied | Duplicate Score |
|---|---|---|---|---:|
| `content_type` | `factual.content_type` | Stage2Context top-level, factual, DirectorBrief.scene fallback | `cleanFact()` | 4 |
| `reel_type` | `factual.reel_type` | Stage2Context top-level, DirectorBrief.scene/generation_intent | `cleanFact()` | 4 |
| `scene_purpose` | `factual.scene_purpose` | Stage2Context, DirectorBrief.scene, PromptComponents.temporal | `cleanFact()` | 4 |
| `activity_context` | `factual.activity_context` | Stage2Context, DirectorBrief.scene, PromptComponents.temporal | `cleanFact()` | 4 |
| `content_theme` | `factual.content_theme` | Stage2Context, DirectorBrief.scene | `cleanFact()` | 4 |
| `reel_energy` | `factual.reel_energy` | Stage2Context, DirectorBrief.reel_energy/generation_intent, PromptComponents.atmosphere | `cleanFact()` | 4 |
| `performance_style` | `factual.performance_style` | Stage2Context, DirectorBrief.performance_style, PromptComponents.temporal | `cleanFact()` | 4 |
| `social_aesthetic` | `factual.social_aesthetic` | Stage2Context, DirectorBrief.social_aesthetic, PromptComponents.atmosphere | `cleanFact()` | 4 |
| `motion_style` | `factual.motion_style` | Stage2Context, DirectorBrief.motion_style, PromptComponents.motion | `cleanFact()` | 4 |
| `viewer_feeling` | `factual.viewer_feeling` | Stage2Context, DirectorBrief.viewer_feeling, PromptComponents.atmosphere/emotion | `cleanFact()` | 4 |
| `camera_presence` | `factual.camera_presence` | Stage2Context, DirectorBrief.camera_presence, PromptComponents.emotion | `cleanFact()` | 4 |
| `music_sync_energy` | `factual.music_sync_energy` | Stage2Context, DirectorBrief.music_sync_energy, PromptComponents.motion | `cleanFact()` | 4 |
| `dance_energy` | `factual.dance_energy` | Stage2Context, DirectorBrief.dance_energy, PromptComponents.atmosphere/motion | `cleanFact()` | 4 |
| `movement_density` | `factual.movement_density` | Stage2Context, DirectorBrief.movement_density, PromptComponents.motion | `cleanFact()` | 4 |
| `motion_rhythm` | `factual.motion_rhythm` | Stage2Context, DirectorBrief.motion_rhythm, PromptComponents.motion | `cleanFact()` | 4 |
| `body_motion_style` | `factual.body_motion_style` | Stage2Context, DirectorBrief.body_motion_style, PromptComponents.motion | `cleanFact()` | 4 |
| `beat_sync_strength` | `factual.beat_sync_strength` | Stage2Context, DirectorBrief.beat_sync_strength, PromptComponents.motion | `cleanFact()` | 4 |
| `performance_intensity` | `factual.performance_intensity` | Stage2Context, DirectorBrief.performance_intensity, PromptComponents.emotion | `cleanFact()` | 4 |
| `camera_engagement` | `factual.camera_engagement` | Stage2Context, DirectorBrief.camera_engagement, PromptComponents.emotion | `cleanFact()` | 4 |
| `movement_continuity` | `factual.movement_continuity` | Stage2Context, DirectorBrief.movement_continuity, PromptComponents.temporal | `cleanFact()` | 4 |
| `motion_focus` | `factual.motion_focus` | Stage2Context, DirectorBrief.motion_focus, PromptComponents.motion | `cleanFact()` | 4 |
| `creator_archetype` | `factual.creator_archetype` | Stage2Context, DirectorBrief.creator_archetype, PromptComponents.subject/atmosphere | `cleanFact()` | 4 |
| `creator_presence` | `factual.creator_presence` | Stage2Context, DirectorBrief.creator_presence, PromptComponents.emotion | `cleanFact()` | 4 |
| `content_personality` | `factual.content_personality` | Stage2Context, DirectorBrief.content_personality, PromptComponents.atmosphere | `cleanFact()` | 4 |
| `social_platform_style` | `factual.social_platform_style` | Stage2Context, DirectorBrief.social_platform_style, PromptComponents.atmosphere | `cleanFact()` | 4 |
| `presentation_style` | `factual.presentation_style` | Stage2Context, DirectorBrief.presentation_style, PromptComponents.action | `cleanFact()` | 4 |
| `viewer_relationship` | `factual.viewer_relationship` | Stage2Context, DirectorBrief.viewer_relationship, PromptComponents.emotion | `cleanFact()` | 4 |
| `creator_intent` | `factual.creator_intent` | Stage2Context, DirectorBrief.creator_intent, PromptComponents.action | `cleanFact()` | 4 |
| `social_behavior` | `factual.social_behavior` | Stage2Context, DirectorBrief.social_behavior, PromptComponents.motion | `cleanFact()` | 4 |
| `pose_rhythm` | `factual.pose_rhythm` | Stage2Context, DirectorBrief.pose_rhythm, PromptComponents.motion/temporal | `cleanFact()` | 4 |
| `performance_pattern` | `factual.performance_pattern` | Stage2Context, DirectorBrief.performance_pattern, PromptComponents.action | `cleanFact()` | 4 |
| `creator_confidence` | `factual.creator_confidence` | Stage2Context, DirectorBrief.creator_confidence, PromptComponents.atmosphere | `cleanFact()` | 4 |
| `viewer_hook_style` | `factual.viewer_hook_style` | Stage2Context, DirectorBrief.viewer_hook_style, PromptComponents.atmosphere | `cleanFact()` | 4 |
| `camera_style` | `socialCamera.camera_style` or `factual.camera_style` | Stage2Context, DirectorBrief.camera_style, PromptComponents.camera | `cleanFact()` | 4 |
| `camera_energy` | `socialCamera.camera_energy` or `factual.camera_energy` | Stage2Context, DirectorBrief.camera_energy, PromptComponents.camera/motion | `cleanFact()` | 4 |
| `camera_relationship` | `socialCamera.camera_relationship` or `factual.camera_relationship` | Stage2Context, DirectorBrief.camera_relationship, PromptComponents.camera | `cleanFact()` | 4 |
| `viewer_perspective` | `socialCamera.viewer_perspective` or `factual.viewer_perspective` | Stage2Context, DirectorBrief.viewer_perspective, PromptComponents.camera | `cleanFact()` | 4 |
| `temporal_opening` | `factual.temporal_opening` | Stage2Context, DirectorBrief.temporal_opening, PromptComponents.temporal | `cleanFact()` | 4 |
| `temporal_progression` | `factual.temporal_progression` | Stage2Context, DirectorBrief.temporal_progression, PromptComponents.motion/temporal | `cleanFact()` | 4 |
| `temporal_continuity` | `factual.temporal_continuity` | Stage2Context, DirectorBrief.temporal_continuity, PromptComponents.motion/temporal | `cleanFact()` | 4 |
| `moment_flow` | `factual.moment_flow` | Stage2Context, DirectorBrief.moment_flow, PromptComponents.temporal | `cleanFact()` | 4 |
| `scene_evolution` | `factual.scene_evolution` | Stage2Context, DirectorBrief.scene_evolution, PromptComponents.temporal | `cleanFact()` | 4 |
| `performance_progression` | `factual.performance_progression` | Stage2Context, DirectorBrief.performance_progression, PromptComponents.motion/temporal | `cleanFact()` | 4 |
| `primary_visual_focus` | `factual.primary_visual_focus` | Stage2Context, DirectorBrief.primary_visual_focus, PromptComponents.finish | `cleanFact()` | 4 |
| `secondary_visual_focus` | `factual.secondary_visual_focus` | Stage2Context, DirectorBrief.secondary_visual_focus, PromptComponents.finish | `cleanFact()` | 4 |
| `attention_progression` | `factual.attention_progression` | Stage2Context, DirectorBrief.attention_progression, PromptComponents.motion | `cleanFact()` | 4 |
| `focus_transition` | `factual.focus_transition` | Stage2Context, DirectorBrief.focus_transition, PromptComponents.motion | `cleanFact()` | 4 |
| `camera_intention` | `factual.camera_intention` | Stage2Context, DirectorBrief.camera_intention, PromptComponents.camera | `cleanFact()` | 4 |
| `visual_priority_flow` | `factual.visual_priority_flow` | Stage2Context, DirectorBrief.visual_priority_flow, PromptComponents.temporal/finish | `cleanFact()` | 4 |
| `overlay_topic` | `factual.overlay_topic` | Stage2Context, DirectorBrief.visual_goal via `overlayTopic` | `cleanFact()` | 3 |
| `spoken_topic` | `factual.spoken_topic` | Stage2Context, DirectorBrief.dialogue | `cleanFact()` | 3 |
| `speech_language` | `factual.speech_language` | Stage2Context, DirectorBrief.dialogue, PromptComponents.audio | `cleanFact()` | 4 |
| `audio_type` | `factual.audio_type` | Stage2Context, DirectorBrief.audio_type, PromptComponents.audio | `cleanFact()` | 5 |
| `audio_role` | `factual.audio_role` | Stage2Context, DirectorBrief.audio_role/audio | `cleanFact()` | 5 |
| `dialogue_summary` | `factual.dialogue_summary` | Stage2Context, DirectorBrief.dialogue/dialogue_summary, PromptComponents.audio | `cleanFact()` | 5 |
| `music_mood` | `factual.music_mood` | Stage2Context, DirectorBrief.music_mood/audio, PromptComponents.audio | `cleanFact()` | 5 |
| `ambient_audio` | `factual.ambient_audio` | Stage2Context, DirectorBrief.ambient_audio/audio, PromptComponents.audio | `cleanFact()` | 5 |
| `primary_object` | `factual.primary_object` | Stage2Context, DirectorBrief.subject/visual_goal, PromptComponents.subject | `rewriteSlotLanguage()` | 4 |
| `hero_element` | `factual.hero_element` | Stage2Context, DirectorBrief.subject/visual_goal, PromptComponents.subject | `rewriteSlotLanguage()` | 4 |
| `director_brief` | `buildDirectorBrief()` output | Stage2Context nested object | Direct embedding | 5 |
| `prompt_components` | `buildPromptComponents()` output | Stage2Context nested object | Direct embedding | 5 |
| `shot_plan` | `buildShotPlan()` output | Stage2Context nested object | Direct embedding | 5 |
| `prompt_slots` | `buildPromptSlots()` output | Stage2Context nested object | Direct embedding | 5 |

## Exact Duplicates / Verbatim Copies

These fields are copied from Stage 1 facts into multiple structures with minimal or no transformation:

- `audio_type`
- `audio_role`
- `dialogue_summary`
- `music_mood`
- `ambient_audio`
- `lighting`
- `performance_style`
- `social_aesthetic`
- `motion_style`
- `viewer_feeling`
- `camera_presence`
- `music_sync_energy`
- `dance_energy`
- `movement_density`
- `motion_rhythm`
- `body_motion_style`
- `beat_sync_strength`
- `performance_intensity`
- `camera_engagement`
- `movement_continuity`
- `motion_focus`
- `creator_archetype`
- `creator_presence`
- `content_personality`
- `social_platform_style`
- `presentation_style`
- `viewer_relationship`
- `creator_intent`
- `social_behavior`
- `pose_rhythm`
- `performance_pattern`
- `creator_confidence`
- `viewer_hook_style`
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

Most are `cleanFact()` in `buildStage2Context()` and `rewriteSlotLanguage()` in `buildDirectorBrief()`. That means they are not always byte-for-byte identical, but they are semantically near-verbatim.

## Near Duplicates

These fields are not copied exactly, but carry the same semantic role:

| Concept | DirectorBrief | PromptComponents | Stage2Context | Duplicate Score |
|---|---|---|---|---:|
| Main subject | `subject` | `subject` | `primary_object`, `hero_element`, `director_brief.subject`, `prompt_components.subject` | 4 |
| Main action | `action` | `action` | `creator_intent`, `performance_pattern`, `prompt_components.action`, `director_brief.action` | 4 |
| Camera behavior | `camera`, `camera_style`, `camera_energy`, `camera_relationship`, `viewer_perspective` | `camera` | same camera fields plus nested objects | 4 |
| Motion behavior | `motion`, motion-energy fields | `motion`, `temporal` | motion-energy fields plus nested objects | 4 |
| Atmosphere / vibe | `reel_energy`, `mood`, creator/social fields | `atmosphere`, `emotion` | reel/social/creator fields plus nested objects | 3 |
| Audio guidance | `dialogue`, `audio`, audio fields | `audio` | audio fields plus nested objects | 3 |
| Visual finish | `visual_goal`, focus fields | `finish` | visual focus fields plus nested objects | 3 |

## Fields Copied Verbatim Into Stage2Context

`buildStage2Context()` embeds:

- `director_brief`
- `prompt_components`
- `shot_plan`
- `prompt_slots`

This creates guaranteed duplication because the top-level compact context also includes the source fields that built those nested structures.

Examples:

- Top-level `creator_archetype` plus `director_brief.creator_archetype` plus `prompt_components.subject`.
- Top-level `camera_style` plus `director_brief.camera_style` plus `prompt_components.camera`.
- Top-level `temporal_progression` plus `director_brief.temporal_progression` plus `prompt_components.temporal`.
- Top-level `dialogue_summary` plus `director_brief.dialogue_summary` plus `prompt_components.audio`.

## Preliminary Redundancy Assessment

This is a source-level duplication assessment, not a refactor recommendation.

High-risk duplication areas:

1. Social/creator fields are repeated as individual top-level context, individual DirectorBrief fields, and grouped PromptComponents buckets.
2. Motion fields are repeated across `DirectorBrief.motion`, `PromptComponents.motion`, `PromptComponents.temporal`, `shot_plan`, and `prompt_slots`.
3. Camera fields are repeated across `DirectorBrief.camera`, fine-grained DirectorBrief camera fields, `PromptComponents.camera`, top-level Stage2Context camera fields, `cameraGrammar`, and `shot_plan.camera_behavior`.
4. Audio fields are repeated as raw top-level compact fields, `DirectorBrief.dialogue/audio`, and `PromptComponents.audio`.
5. `buildStage2Context()` directly embeds both structures, making duplication structural rather than incidental.

## Main Finding

`buildPromptComponents()` and `buildDirectorBrief()` are not identical, but they mostly draw from the same factual fields.

The strongest distinction is:

- `buildDirectorBrief()` is detailed and director-facing.
- `buildPromptComponents()` is bucketed and profile-assembly-facing.

However, `buildStage2Context()` currently carries both simultaneously, plus many of their raw source fields. That makes it the largest duplication point and the most likely source of semantic repetition in Stage 2 assembly.

No removal or architectural change is recommended here without runtime trace confirmation.
