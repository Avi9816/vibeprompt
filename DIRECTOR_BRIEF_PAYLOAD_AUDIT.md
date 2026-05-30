# DirectorBrief Payload Audit

## Scope

Audited `buildDirectorBrief()` and its downstream usage in `backend/analyzer.js`.

Goal:

- identify which DirectorBrief fields survive into the final Stage 2 Gemini prompt
- identify duplicated fields across `ShotPlan`, `PromptSlots`, and `CompactContext`
- rank fields by character cost, uniqueness, and compression opportunity

No code was changed.

## Executive Summary

`buildDirectorBrief()` produces a large in-memory object with many social, creator, temporal, camera, audio, and attention fields.

However, `compressStage2Assembly()` serializes only this retained subset into `DIRECTOR_BRIEF`:

```js
{
  subject,
  action,
  camera,
  motion,
  lighting,
  environment,
  mood,
  audio,
  visual_goal,
  generation_intent,
  creator_performance_mode,
  speech_delivery_style,
  audience_connection,
  creator_energy,
  conversation_presence,
  microphone_importance
}
```

The rest of the DirectorBrief fields do not directly survive into the final Stage 2 Gemini prompt, though many are consumed by:

- master prompt generation
- prompt refinement
- prompt rewrite
- validation
- visual translation
- guardrails

The highest-impact retained payload reduction opportunity is:

```txt
generation_intent + visual_goal + creator-performance fields
```

These fields are often long, semantically overlapping, and partially duplicated by `subject`, `action`, `motion`, `audio`, `ShotPlan`, and `PromptSlots`.

## Retained Stage 2 DirectorBrief Fields

| Field | Source / Construction | Typical Size | Downstream Consumers | Duplicated By | Duplication Count | Survives Final Stage 2 Prompt | Uniqueness | Compression Opportunity |
|---|---|---:|---|---|---:|---:|---:|---:|
| `subject` | creator label, archetype, hero object, primary object, product identity, food focus, subjects, shot opening | 30-90 chars | Stage2 prompt, master prompt, evaluation, rewrite | `SHOT_PLAN.opening_visual`, `PROMPT_SLOTS.OPENING_VISUAL`, `CompactContext.creator_archetype`, object fields | 3-5 | yes | high | medium |
| `action` | speech/action abstraction, creator intent performance pattern, shot primary action, pose action | 40-130 chars | Stage2 prompt, master prompt, evaluation, rewrite | `SHOT_PLAN.primary_action`, `PROMPT_SLOTS.PRIMARY_ACTION`, `generation_intent`, `motion` | 3-4 | yes | high | medium |
| `camera` | social camera style, shot camera behavior, camera grammar, Stage 1 camera motion | 30-90 chars | Stage2 prompt, master prompt, rewrite, validation | `SHOT_PLAN.camera_behavior`, `PROMPT_SLOTS.CAMERA_BEHAVIOR`, `CompactContext.camera_style` | 3 | yes | medium-high | medium |
| `motion` | subject motion, visible motion, environmental motion, motion energy, temporal fields, creator intent, camera energy, micro-motion | 80-240 chars | Stage2 prompt, master prompt, evaluation, rewrite | `action`, `SHOT_PLAN.primary_action`, `SHOT_PLAN.secondary_motion`, `PROMPT_SLOTS.PRIMARY_ACTION`, `PROMPT_SLOTS.SECONDARY_MOTION` | 4-6 | yes | medium | high |
| `lighting` | Stage 1 lighting | 20-90 chars | Stage2 prompt, master prompt, rewrite | `SHOT_PLAN.visual_finish`, sometimes `PROMPT_SLOTS.VISUAL_FINISH` | 1-2 | yes | high | low |
| `environment` | shot environment response, Stage 1 environment, surfaces | 30-120 chars | Stage2 prompt, master prompt, rewrite | `SHOT_PLAN.environment_response`, `PROMPT_SLOTS.ENVIRONMENT_RESPONSE`, sometimes `visual_finish` | 2-3 | yes | medium | medium |
| `mood` | mood atmosphere or audience intent | 20-90 chars | Stage2 prompt, master prompt, rewrite | `visual_goal`, `generation_intent`, `PLATFORM_PROFILE.style` | 2-3 | yes | low-medium | medium |
| `audio` | audio type, role, dialogue summary, music mood, ambient audio, silence direction | 30-160 chars | Stage2 prompt, audio guidance, master prompt, validation | `AUDIO_GUIDANCE`, `speech_delivery_style`, `conversation_presence`, `dialogue_summary` not retained | 2-4 | yes | high | medium |
| `visual_goal` | creator performance, audience connection, mic importance, reel energy, creator archetype, social aesthetic, creator intent, camera relationship, objects | 40-160 chars | Stage2 prompt, master prompt, rewrite | `subject`, `action`, `generation_intent`, `creator_performance_mode`, `audience_connection`, `microphone_importance` | 4-7 | yes | medium | high |
| `generation_intent` | creator energy, speech style, reel energy, temporal fields, visual focus, creator intent, viewer perspective, reel type, audience intent, workflow | 80-260 chars | Stage2 prompt, master prompt, rewrite | `visual_goal`, `action`, `motion`, creator-performance fields, compact context fields | 5-9 | yes | medium | very high |
| `creator_performance_mode` | `deriveCreatorPerformanceMode()` | 25-80 chars | Stage2 prompt, master prompt | `subject`, `generation_intent`, `visual_goal` | 2-3 | yes | medium | medium-high |
| `speech_delivery_style` | `deriveCreatorPerformanceMode()` | 35-100 chars | Stage2 prompt, audio guidance context, master prompt, social validation | `audio`, `conversation_presence`, `generation_intent` | 2-4 | yes | medium | medium-high |
| `audience_connection` | `deriveCreatorPerformanceMode()` | 30-90 chars | Stage2 prompt, master prompt | `camera`, `visual_goal`, `generation_intent`, `conversation_presence` | 3-4 | yes | low-medium | high |
| `creator_energy` | `deriveCreatorPerformanceMode()` | 30-100 chars | Stage2 prompt, master prompt | `generation_intent`, `visual_goal`, reel energy fields | 2-4 | yes | medium | high |
| `conversation_presence` | `deriveCreatorPerformanceMode()` | 30-100 chars | Stage2 prompt, master prompt | `speech_delivery_style`, `audio`, `audience_connection` | 3 | yes | low-medium | high |
| `microphone_importance` | microphone detection / creator performance mode | 30-110 chars | Stage2 prompt, master prompt | `visual_goal`, `subject`, `audio` when mic/podcast detected | 2-4 | yes | high when mic exists, low otherwise | medium |

## Non-Retained DirectorBrief Fields

The following fields are produced by `buildDirectorBrief()` but are not included in the compressed `DIRECTOR_BRIEF` object serialized by `compressStage2Assembly()`.

They may still affect:

- `buildMasterPromptFromBrief()`
- `buildAudioPromptGuidance()`
- `evaluatePromptQuality()`
- `rewritePrompt()`
- `translateToGenerativeVisualLanguage()`
- `validateCreatorPerformancePrompt()`
- `finalPromptPolish()`

They do not directly consume final Stage 2 Gemini prompt budget through `DIRECTOR_BRIEF`.

| Field Group | Fields | Survives Final Stage 2 `DIRECTOR_BRIEF` | Notes |
|---|---|---:|---|
| Reel energy | `reel_energy`, `performance_style`, `social_aesthetic`, `motion_style`, `viewer_feeling`, `music_sync_energy` | no | Often folded into `motion`, `visual_goal`, or `generation_intent` |
| Motion energy | `dance_energy`, `movement_density`, `motion_rhythm`, `body_motion_style`, `beat_sync_strength`, `performance_intensity`, `movement_continuity`, `motion_focus` | no | Usually folded into `motion` or `generation_intent` |
| Camera/social presence | `camera_presence`, `camera_engagement`, `camera_style`, `camera_energy`, `camera_relationship`, `viewer_perspective` | no | `camera_style` often becomes retained `camera`; others are folded into `motion`, `visual_goal`, or `generation_intent` |
| Creator archetype | `creator_archetype`, `creator_presence`, `content_personality`, `social_platform_style`, `presentation_style`, `viewer_relationship` | no | Often folded into retained `subject`, `visual_goal`, or `generation_intent` |
| Creator intent | `creator_intent`, `social_behavior`, `pose_rhythm`, `performance_pattern`, `creator_confidence`, `viewer_hook_style` | no | Often folded into retained `action`, `motion`, `visual_goal`, or `generation_intent` |
| Temporal | `temporal_opening`, `temporal_progression`, `temporal_continuity`, `moment_flow`, `scene_evolution`, `performance_progression` | no | Often folded into retained `motion` and `generation_intent` |
| Attention | `primary_visual_focus`, `secondary_visual_focus`, `attention_progression`, `focus_transition`, `camera_intention`, `visual_priority_flow` | no | Often folded into retained `motion`, `visual_goal`, and `generation_intent` |
| Audio detail | `dialogue`, `audio_type`, `silence_direction`, `audio_role`, `dialogue_summary`, `music_mood`, `ambient_audio` | no | `audio` and `AUDIO_GUIDANCE` carry the retained audio summary |

## Duplication Against ShotPlan

| DirectorBrief Field | ShotPlan Duplicate | Duplication Type | Notes |
|---|---|---|---|
| `subject` | `opening_visual` | near/exact | Opening visual often contains same creator/object subject plus environment |
| `action` | `primary_action` | near/exact | Director action often chooses shot action or creator action abstraction |
| `camera` | `camera_behavior` | near/exact | Director camera falls back to shot camera behavior if no social camera style |
| `motion` | `secondary_motion`, `primary_action` | partial | Motion aggregates many details, including primary and supplemental motion |
| `lighting` | `visual_finish` | partial | Visual finish combines lens, lighting, mood, and mic note |
| `environment` | `environment_response` | near/exact | Director environment prefers shot environment response |
| `mood` | `visual_finish` | partial | Mood may appear in visual finish |
| `audio` | none directly | low | Audio is separate from shot plan |
| `visual_goal` | `visual_finish`, `opening_visual` | partial | Object/product/mic focus may overlap |
| `generation_intent` | multiple shot fields | partial | Aggregates temporal and creator intent more than shot plan |

## Duplication Against PromptSlots

| DirectorBrief Field | PromptSlots Duplicate | Duplication Type | Notes |
|---|---|---|---|
| `subject` | `OPENING_VISUAL` | high | Both tell Gemini what the shot starts with |
| `action` | `PRIMARY_ACTION` | high | Both tell Gemini what happens |
| `camera` | `CAMERA_BEHAVIOR` | medium-high | Both give camera/framing behavior |
| `motion` | `PRIMARY_ACTION`, `SECONDARY_MOTION` | high | Motion repeats action plus micro-motion |
| `lighting` | `VISUAL_FINISH` | medium | Lighting usually appears in visual finish |
| `environment` | `ENVIRONMENT_RESPONSE` | high | Same environment detail often retained twice |
| `mood` | `VISUAL_FINISH` | medium | Mood/atmosphere often folded into finish |
| `audio` | none | low | Prompt slots do not carry audio |
| `visual_goal` | `OPENING_VISUAL`, `VISUAL_FINISH` | medium | Visual goal overlaps with focal subject/finish |
| `generation_intent` | all slots semantically | medium | Intent is broad and often rephrases slot purpose |

## Duplication Against CompactContext

`CompactContext` usually does not survive the final hard slice, but before truncation it duplicates many DirectorBrief inputs.

| DirectorBrief Field | CompactContext Duplicate | Final Prompt Impact |
|---|---|---|
| `subject` | `creator_archetype`, `primary_object`, `hero_element` | usually none because CompactContext often excluded |
| `camera` | `camera_style` | usually none; camera dedup showed negligible size impact |
| `motion` | `reel_energy`, `dance_energy`, `pose_rhythm`, `creator_intent` | usually none |
| `audio` | `audio_type`, `speech_language`, `spoken_topic` | usually none |
| `visual_goal` | `creator_archetype`, `hero_element`, `primary_object`, `overlay_topic` | usually none |
| `generation_intent` | `reel_type`, `creator_intent`, `reel_energy`, `dance_energy` | usually none |

## Size Contribution Ranking

Likely highest character consumers inside retained `DIRECTOR_BRIEF`:

1. `generation_intent`
2. `motion`
3. `visual_goal`
4. `audio`
5. `action`
6. `environment`
7. `microphone_importance`
8. `speech_delivery_style`
9. `creator_energy`
10. `conversation_presence`
11. `subject`
12. `camera`
13. `lighting`
14. `audience_connection`
15. `creator_performance_mode`
16. `mood`

Rationale:

- `generation_intent` joins many high-level fields and can easily become the longest retained field.
- `motion` joins subject, environmental, temporal, creator, camera-energy, and micro-motion strings.
- `visual_goal` joins creator performance, reel energy, archetype, social style, creator intent, camera relationship, and object focus.
- Creator-performance fields are individually shorter, but several survive together and repeat the same speaking/creator energy theme.

## Uniqueness Ranking

Most unique:

1. `audio`
2. `lighting`
3. `microphone_importance` when microphone is visible
4. `subject`
5. `action`
6. `camera`

Least unique:

1. `generation_intent`
2. `visual_goal`
3. `conversation_presence`
4. `audience_connection`
5. `creator_energy`
6. `mood`

Reason:

- The least-unique fields are synthesized from other fields and often summarize a theme already represented in subject/action/motion/audio/slots.
- `generation_intent` and `visual_goal` are useful as semantic guidance, but expensive and overlapping.

## Compression Opportunity Ranking

| Rank | Field / Field Group | Expected Savings | Risk | Reason |
|---:|---|---:|---|---|
| 1 | `generation_intent` | 80-220 chars | medium | Long aggregate; often duplicates visual goal, action, motion, creator energy |
| 2 | `motion` | 80-180 chars | medium-high | Long aggregate; overlaps action and slot motion, but important for motion realism |
| 3 | creator-performance cluster | 120-300 chars | medium | Six retained fields can repeat speech/creator presence themes |
| 4 | `visual_goal` | 60-150 chars | medium | Often duplicates subject/object focus and creator intent |
| 5 | `environment` | 30-90 chars | low-medium | Duplicated by shot plan and slots |
| 6 | `camera` | 20-60 chars | medium | Duplicated by shot plan/slots, but important validation signal |
| 7 | `audio` | 20-80 chars | high if speech/music | Duplicated by audio guidance, but critical for audio correctness |

## Highest-Impact Payload Reduction Opportunity

Best candidate:

```txt
DirectorBrief semantic-intent compression
```

Target fields:

- `generation_intent`
- `visual_goal`
- `creator_performance_mode`
- `speech_delivery_style`
- `audience_connection`
- `creator_energy`
- `conversation_presence`
- `microphone_importance`

Suggested experiment:

```txt
VP_COMPACT_DIRECTOR_BRIEF=1
```

Potential behavior:

```js
{
  subject,
  action,
  camera,
  motion,
  lighting,
  environment,
  audio,
  intent: compact one-line merge of visual_goal + generation_intent,
  creator_performance: compact one-line merge of creator-performance cluster
}
```

Expected savings:

```txt
250-600 chars
```

Risk:

```txt
medium
```

Reason:

- It preserves core subject/action/camera/motion/audio facts.
- It removes repeated semantic reinforcement.
- It may reduce creator-performance nuance if compressed too aggressively.

## Safer First Experiment

Before compressing the whole brief, test a narrower field-level experiment:

```txt
VP_COMPACT_DIRECTOR_INTENT=1
```

Behavior:

- Cap `generation_intent` to one compact phrase.
- Cap `visual_goal` to one compact phrase.
- Leave all other retained DirectorBrief fields unchanged.

Expected savings:

```txt
140-350 chars
```

Risk:

```txt
low-to-medium
```

## Conclusion

The retained `DIRECTOR_BRIEF` is valuable, but it contains several high-cost aggregate fields that repeat information already present in:

- `SHOT_PLAN`
- `PROMPT_SLOTS`
- `AUDIO_GUIDANCE`
- other DirectorBrief fields

The best next payload target inside DirectorBrief is not `subject`, `action`, `camera`, or `audio`.

The best target is:

```txt
generation_intent + visual_goal + creator-performance cluster
```

These fields provide the most characters with the least unique information, and they are likely the safest place to run the next compression experiment.

