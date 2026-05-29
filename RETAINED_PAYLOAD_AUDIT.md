# Retained Payload Audit

## Scope

Audited the final Stage 2 Gemini assembly in `backend/analyzer.js`, specifically the compressed payload produced by `compressStage2Assembly()`.

Sections investigated:

- `PLATFORM_PROFILE`
- `PLATFORM_TEMPLATE`
- `DIRECTOR_BRIEF`
- `DIRECTOR_PROMPT`
- `SHOT_PLAN`
- `PROMPT_SLOTS`
- `AUDIO_GUIDANCE`

No code was changed.

## Key Finding

The sections that actually compete for the final Gemini prompt budget are the early retained sections:

1. `PLATFORM_PROFILE`
2. `PLATFORM_TEMPLATE`
3. `DIRECTOR_BRIEF`
4. `AUDIO_GUIDANCE`
5. `DIRECTOR_PROMPT`
6. `SHOT_PLAN`
7. `PROMPT_SLOTS`

When the prompt exceeds `4000` chars, the code first empties:

```txt
DIRECTOR_PROMPT: {}
COMPACT_CONTEXT: {}
```

If still over `4000`, it hard-slices at `3900` chars and appends the JSON return reminder. Because `COMPACT_CONTEXT` appears late, it often disappears entirely. The sections before `SHOT_PLAN` almost always survive; `PROMPT_SLOTS` may survive partially or fully depending on upstream section sizes.

## Assembly Order

Current compressed prompt order:

```txt
Generate JSON only...

PLATFORM_PROFILE:
...

PLATFORM_TEMPLATE:
...

DIRECTOR_BRIEF:
...

AUDIO_GUIDANCE:
...

DIRECTOR_PROMPT:
...

SHOT_PLAN:
...

PROMPT_SLOTS:
...

COMPACT_CONTEXT:
...

SPEECH_LANGUAGE:
...

RULES:
...
```

After the `4000`-char compaction step:

```txt
DIRECTOR_PROMPT:
{}

COMPACT_CONTEXT:
{}
```

After the final `3900` hard slice:

- early sections survive
- `COMPACT_CONTEXT` often does not survive
- `SPEECH_LANGUAGE` and `RULES` may be truncated or removed
- `PROMPT_SLOTS` may be the last large useful section before the slice

## Section Size Caps

These caps are enforced by `compactJson()` inside `compressStage2Assembly()`.

| Section | Cap / Expected Size | Notes |
|---|---:|---|
| `PLATFORM_PROFILE` | up to 900 chars | Static-ish platform metadata plus reference pattern statistics |
| `PLATFORM_TEMPLATE` | up to 650 chars | Platform order, style, and structure |
| `DIRECTOR_BRIEF` | up to 900 chars | Instance-specific subject/action/camera/motion/audio intent |
| `AUDIO_GUIDANCE` | typically 0-180 chars | Short free-text guidance; no JSON cap |
| `DIRECTOR_PROMPT` | up to 500 chars, then usually `{}` | Emptied when prompt exceeds 4000 chars |
| `SHOT_PLAN` | up to 900 chars | Ordered shot-plan object with six plan fields |
| `PROMPT_SLOTS` | up to 900 chars | Platform-specific slot order and populated slot values |

Approximate fixed labels and spacing add another 180-260 chars before the rules block.

## Size Ranking

| Rank | Section | Typical Retained Size | Percentage of 3940-char Final Prompt | Survival |
|---:|---|---:|---:|---|
| 1 | `PLATFORM_PROFILE` | 700-900 chars | 18-23% | high |
| 2 | `DIRECTOR_BRIEF` | 700-900 chars | 18-23% | high |
| 3 | `SHOT_PLAN` | 550-900 chars | 14-23% | high |
| 4 | `PROMPT_SLOTS` | 500-900 chars | 13-23% | medium-high, may be truncated near end |
| 5 | `PLATFORM_TEMPLATE` | 350-650 chars | 9-16% | high |
| 6 | `AUDIO_GUIDANCE` | 0-180 chars | 0-5% | high |
| 7 | `DIRECTOR_PROMPT` | `{}` after compaction, otherwise up to 500 chars | usually <1%, otherwise up to 13% | low after compaction |

## Survival Ranking

| Rank | Section | Survival Probability | Reason |
|---:|---|---:|---|
| 1 | `PLATFORM_PROFILE` | very high | Appears first after header |
| 2 | `PLATFORM_TEMPLATE` | very high | Early section |
| 3 | `DIRECTOR_BRIEF` | very high | Early section and not emptied |
| 4 | `AUDIO_GUIDANCE` | very high | Early and short |
| 5 | `SHOT_PLAN` | high | Appears before prompt slots and compact context |
| 6 | `PROMPT_SLOTS` | medium-high | Usually included, but near truncation boundary |
| 7 | `DIRECTOR_PROMPT` | low | Explicitly replaced with `{}` when prompt exceeds 4000 |

## Section-by-Section Audit

### PLATFORM_PROFILE

Producer:

```js
compactProfileForStage2(promptProfile, compactTemplate, referencePattern)
```

Serialized as:

```js
compactJson(profile, 900)
```

Fields:

- `structure`
- `style`
- `emphasis`
- `ideal_length`
- `avoid`
- `writing`
- `pattern`

Downstream instruction references:

- `Keep subject, action, camera, motion, lighting, audio, profile, and shot plan.`
- `Write native PLATFORM generative video language`
- `platformNativeDirectives(field)`

Duplicated information:

- `structure` overlaps with `PLATFORM_TEMPLATE.order` and `PLATFORM_TEMPLATE.structure`
- `style` overlaps with `PLATFORM_TEMPLATE.style`
- `writing` overlaps with `PLATFORM_TEMPLATE` writing rules and `platformNativeDirectives()`
- `avoid` partially overlaps with the hardcoded final rule banning invented/cinematic terms
- `pattern` influences target rhythm but is not directly referenced by strict slot instructions

Estimated savings:

- Compressing from 900 to 350-450 chars could save 450-550 chars.
- Removing `pattern` from the final prompt could save 120-220 chars.
- Removing duplicated `structure/style` where already present in `PLATFORM_TEMPLATE` could save 120-250 chars.

Uniqueness:

- Low-to-medium.
- High platform importance, but much of it is static and duplicated elsewhere.

Risk:

- Medium.
- Too much reduction could weaken platform-native differentiation.

### PLATFORM_TEMPLATE

Producer:

```js
buildPlatformPromptTemplate()
```

Serialized as:

```js
compactJson({
  order,
  style,
  structure
}, 650)
```

Fields retained:

- `order`
- `style`
- `structure`

Downstream instruction references:

- The prompt asks for platform-native language.
- Slot order is separately enforced by `PROMPT_SLOTS`, not by this section.

Duplicated information:

- `order` overlaps with `PLATFORM_PROFILE.structure`
- `style` overlaps with `PLATFORM_PROFILE.style`
- `structure` overlaps with `DIRECTOR_PROMPT.composition` and `platformNativeDirectives()`

Estimated savings:

- Reducing `structure` prose could save 150-300 chars.
- Keeping only `style` plus a compact platform label could save 250-450 chars.

Uniqueness:

- Medium.
- It carries platform-specific structure, but that is already partially represented in `PROMPT_SLOTS.slotOrder` and hardcoded platform directives.

Risk:

- Medium.
- It may be useful reinforcement, but it is not the strictest control mechanism.

### DIRECTOR_BRIEF

Producer:

```js
buildDirectorBrief()
```

Compressed subset serialized:

```js
compactJson(brief, 900)
```

Fields retained:

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

Downstream instruction references:

- `Keep subject, action, camera, motion, lighting, audio...`
- Used as semantic and generation-oriented source context before Gemini writes the final platform field.

Duplicated information:

- `subject` overlaps with `SHOT_PLAN.opening_visual` and `PROMPT_SLOTS.OPENING_VISUAL`
- `action` overlaps with `SHOT_PLAN.primary_action` and `PROMPT_SLOTS.PRIMARY_ACTION`
- `camera` overlaps with `SHOT_PLAN.camera_behavior` and `PROMPT_SLOTS.CAMERA_BEHAVIOR`
- `motion` overlaps with `SHOT_PLAN.secondary_motion` and action slots
- `lighting/environment/mood` overlap with `SHOT_PLAN.environment_response` and `visual_finish`
- `audio` overlaps with `AUDIO_GUIDANCE`
- performance fields overlap with `generation_intent`, `visual_goal`, and sometimes `subject/action`

Estimated savings:

- Reducing retained fields to only `subject`, `action`, `camera`, `motion`, `lighting`, `audio`, and one intent field could save 250-450 chars.
- Moving creator-performance fields into a single compact phrase could save 150-300 chars.

Uniqueness:

- High for subject/action/audio/social intent.
- Medium for camera/motion/environment due to overlap with shot plan and slots.

Risk:

- Medium-to-high.
- This is the most important semantic bridge; compression should be selective, not removal.

### AUDIO_GUIDANCE

Producer:

```js
buildAudioPromptGuidance(platform, directorBrief)
```

Serialized as raw text:

```txt
AUDIO_GUIDANCE:
...
```

Downstream instruction references:

- `Keep ... audio`
- Audio validation expects speech/music guidance when relevant.

Duplicated information:

- Overlaps with `DIRECTOR_BRIEF.audio`
- Overlaps with `DIRECTOR_BRIEF.dialogue_summary` indirectly, but the compressed brief does not retain `dialogue_summary`

Estimated savings:

- Usually only 40-180 chars.
- Compression opportunity is small.

Uniqueness:

- High when speech/music exists.
- Low when `none`.

Risk:

- Low size benefit, high behavioral importance for speech/music correctness.

### DIRECTOR_PROMPT

Producer:

```js
buildDirectorPrompt()
```

Serialized as:

```js
compactJson(compactDirector, 500)
```

Fields:

- `style`
- `structure`
- `composition`

Compaction behavior:

When prompt exceeds `4000`, this section is replaced with:

```json
{}
```

Downstream instruction references:

- Stage 2 assembly readiness checks require `DIRECTOR_PROMPT:` label.
- Content usually does not survive in over-budget prompts.

Duplicated information:

- `style` overlaps with `PLATFORM_TEMPLATE.style`
- `structure` overlaps with `PLATFORM_TEMPLATE.order` and `PLATFORM_PROFILE.structure`
- `composition` overlaps with `PLATFORM_TEMPLATE.structure` and `platformNativeDirectives()`

Estimated savings:

- Already reduced to `{}` in most over-budget runs.
- Further optimization has negligible impact unless prompts are under 4000 before compaction.

Uniqueness:

- Low in actual final payload.

Risk:

- Low for content compression, but the label is required by `stage2AssemblyReady()`.

### SHOT_PLAN

Producer:

```js
buildShotPlan()
```

Serialized as:

```js
compactJson({ order: shotPlanOrder, plan: shotPlan }, 900)
```

Fields:

- `order`
- `plan.opening_visual`
- `plan.primary_action`
- `plan.secondary_motion`
- `plan.camera_behavior`
- `plan.environment_response`
- `plan.visual_finish`

Downstream instruction references:

- `Keep ... shot plan`
- `Build the prompt from PROMPT_SLOTS in order`
- `SHOT_PLAN` is one of the required modern assembly labels.

Duplicated information:

- `order` overlaps with `PROMPT_SLOTS.slotOrder`
- every `plan.*` field overlaps with the corresponding `PROMPT_SLOTS` value
- `camera_behavior` overlaps with `DIRECTOR_BRIEF.camera`
- `opening_visual` overlaps with `DIRECTOR_BRIEF.subject`
- `primary_action` overlaps with `DIRECTOR_BRIEF.action`
- `visual_finish` overlaps with `DIRECTOR_BRIEF.lighting/environment/mood`

Estimated savings:

- Removing `order` could save 70-130 chars.
- Serializing only fields not already represented in prompt slots could save 250-500 chars.
- Removing full `SHOT_PLAN` would save 550-900 chars, but risk is significant.

Uniqueness:

- Medium.
- It provides the structured source of truth for slots, but once slots are created the retained copy becomes mostly redundant.

Risk:

- Medium-to-high.
- The system currently treats shot plan as a required modern assembly module.

### PROMPT_SLOTS

Producer:

```js
buildPromptSlots()
```

Serialized as:

```js
compactJson(promptSlots, 900)
```

Fields:

- `platform`
- `content_type`
- `slotOrder`
- `populatedSlots`

Downstream instruction references:

- `Build the prompt from PROMPT_SLOTS in order`
- `PROMPT_SLOTS` is the strict slot-enforcement mechanism.

Duplicated information:

- `slotOrder` overlaps with `SHOT_PLAN.order`
- `populatedSlots.OPENING_VISUAL` overlaps with `SHOT_PLAN.plan.opening_visual`
- `populatedSlots.PRIMARY_ACTION` overlaps with `SHOT_PLAN.plan.primary_action`
- `populatedSlots.SECONDARY_MOTION` overlaps with `SHOT_PLAN.plan.secondary_motion`
- `populatedSlots.CAMERA_BEHAVIOR` overlaps with `SHOT_PLAN.plan.camera_behavior`
- `populatedSlots.ENVIRONMENT_RESPONSE` overlaps with `SHOT_PLAN.plan.environment_response`
- `populatedSlots.VISUAL_FINISH` overlaps with `SHOT_PLAN.plan.visual_finish`

Estimated savings:

- Removing `platform` and `content_type` could save 40-80 chars.
- Removing duplicate `slotOrder` if order exists elsewhere could save 70-130 chars.
- Compressing labels could save 80-160 chars.
- Removing `PROMPT_SLOTS` entirely is not recommended.

Uniqueness:

- High behavior value.
- Medium content uniqueness because it derives from shot plan.

Risk:

- High.
- This is the main slot-only enforcement structure.

## Duplication Ranking

| Rank | Duplicate Pair | Duplication Level | Notes |
|---:|---|---:|---|
| 1 | `SHOT_PLAN.plan.*` vs `PROMPT_SLOTS.populatedSlots.*` | very high | Prompt slots are derived directly from shot plan |
| 2 | `PLATFORM_PROFILE.structure/style/writing` vs `PLATFORM_TEMPLATE.order/style/structure` | high | Two platform metadata sections carry similar guidance |
| 3 | `DIRECTOR_BRIEF.subject/action/camera` vs `PROMPT_SLOTS.OPENING_VISUAL/PRIMARY_ACTION/CAMERA_BEHAVIOR` | medium-high | Brief abstracts the same core shot facts |
| 4 | `DIRECTOR_BRIEF.audio` vs `AUDIO_GUIDANCE` | medium | Audio guidance is a platform-oriented restatement |
| 5 | `DIRECTOR_PROMPT` vs `PLATFORM_TEMPLATE` | high in source, low in final | Usually emptied before final payload |

## Optimization Candidate Ranking

### 1. `PLATFORM_PROFILE`

Why:

- Large, early, and highly likely to survive.
- Contains static platform metadata rather than reel-specific information.
- Overlaps with `PLATFORM_TEMPLATE` and hardcoded platform directives.

Potential savings:

- 350-550 chars.

Risk:

- Medium.

Suggested experiment:

- Feature flag to serialize only:
  - `structure`
  - top 3 emphasis scores
  - ideal word range
  - top 3 avoid terms
  - no reference pattern frequencies unless explicitly used

### 2. `PLATFORM_TEMPLATE`

Why:

- Early and likely to survive.
- Duplicates profile structure and prompt-native directives.

Potential savings:

- 250-450 chars.

Risk:

- Medium.

Suggested experiment:

- Replace verbose `structure` sentence with a short platform style token.

### 3. `SHOT_PLAN` vs `PROMPT_SLOTS`

Why:

- Together can consume 1100-1800 chars.
- They carry near-identical shot content.

Potential savings:

- 400-800 chars if one is compressed to references/order only.

Risk:

- Medium-to-high.

Suggested experiment:

- Keep `PROMPT_SLOTS` full.
- Reduce `SHOT_PLAN` to `{order:[...], source:"slot-derived"}` or only keep fields not present in slots.

### 4. `DIRECTOR_BRIEF`

Why:

- Large and early.
- Contains both unique semantic intent and duplicated shot fields.

Potential savings:

- 250-450 chars through selective field compaction.

Risk:

- Medium-to-high.

Suggested experiment:

- Keep only:
  - `subject`
  - `action`
  - `camera`
  - `motion`
  - `lighting`
  - `audio`
  - one compact `intent`

### 5. `AUDIO_GUIDANCE`

Why:

- Small.
- High behavioral importance.

Potential savings:

- Minimal.

Risk:

- Not worth prioritizing.

### 6. `DIRECTOR_PROMPT`

Why:

- Already reduced to `{}` when over budget.

Potential savings:

- Negligible in current over-budget path.

Risk:

- Low, but not useful.

## Section Providing Most Characters With Least Unique Information

Best candidate:

```txt
PLATFORM_PROFILE
```

Reason:

- It can consume up to 900 chars.
- It appears before the truncation boundary, so it survives.
- It is mostly static per platform.
- It duplicates information already present in:
  - `PLATFORM_TEMPLATE`
  - `platformNativeDirectives()`
  - reference pattern target word logic
  - final rules

Second candidate:

```txt
SHOT_PLAN
```

Reason:

- Large and substantially duplicated by `PROMPT_SLOTS`.
- However, it is more instance-specific than `PLATFORM_PROFILE`, so removal risk is higher.

## Recommended Next Experiment

The next high-impact experiment should target platform metadata, not compact context.

Suggested flag:

```txt
VP_COMPACT_PLATFORM_METADATA=1
```

Experiment behavior:

- Keep `PLATFORM_PROFILE` under 350-450 chars.
- Keep `PLATFORM_TEMPLATE` under 250-350 chars.
- Preserve slot and director-brief content unchanged.

Expected benefit:

- 500-900 chars saved before the truncation boundary.
- Lower risk than removing shot-plan or prompt-slot content.

Alternative higher-risk experiment:

```txt
VP_DEDUP_SHOT_PLAN_SLOTS=1
```

Experiment behavior:

- Keep full `PROMPT_SLOTS`.
- Compress `SHOT_PLAN` to order plus omitted/empty slot metadata.

Expected benefit:

- 400-800 chars saved.
- Higher risk because `SHOT_PLAN` is a required modern assembly module and may reinforce slot-following.

## Conclusion

`COMPACT_CONTEXT` is not the main prompt-budget problem because it usually does not survive final truncation.

The highest-impact retained payload targets are:

1. `PLATFORM_PROFILE`
2. `PLATFORM_TEMPLATE`
3. `SHOT_PLAN` duplicated by `PROMPT_SLOTS`
4. `DIRECTOR_BRIEF` duplicated by both shot plan and prompt slots

The section with the least unique information relative to its retained size is `PLATFORM_PROFILE`.

