# Surviving Payload Audit

## Scope

Audited which fields inside `DIRECTOR_BRIEF` and `SHOT_PLAN` survive the final Stage 2 Gemini payload after compression and the hard `3900` character slice.

No code was changed.

## Final Payload Mechanics

The relevant compressed assembly order is:

```txt
Header
PLATFORM_PROFILE
PLATFORM_TEMPLATE
DIRECTOR_BRIEF
AUDIO_GUIDANCE
DIRECTOR_PROMPT
SHOT_PLAN
PROMPT_SLOTS
COMPACT_CONTEXT
SPEECH_LANGUAGE
RULES
```

When the assembled prompt exceeds `4000` chars:

```js
DIRECTOR_PROMPT -> {}
COMPACT_CONTEXT -> {}
```

If still over `4000` chars:

```js
prompt = prompt.slice(0, 3900) + Return JSON reminder
```

Implication:

- `DIRECTOR_BRIEF` is early and very likely to survive.
- `SHOT_PLAN` is after `DIRECTOR_PROMPT`, but `DIRECTOR_PROMPT` is emptied before final slicing, so `SHOT_PLAN` usually survives.
- `PROMPT_SLOTS` follows `SHOT_PLAN` and is more vulnerable to truncation.
- Later fields inside `SHOT_PLAN` are more exposed than earlier fields.

## Survival Assumptions

This is a static payload audit based on the current assembly order and caps:

- `PLATFORM_PROFILE`: up to 900 chars
- `PLATFORM_TEMPLATE`: up to 650 chars
- `DIRECTOR_BRIEF`: up to 900 chars
- `DIRECTOR_PROMPT`: up to 500 chars, usually `{}` after compaction
- `SHOT_PLAN`: up to 900 chars
- `PROMPT_SLOTS`: up to 900 chars

Actual runtime survival depends on:

- platform profile compression flag
- director intent compression flag
- field lengths
- platform template length
- whether `PROMPT_SLOTS` and `RULES` are truncated

## DIRECTOR_BRIEF Survivors

`compressStage2Assembly()` retains only these `DIRECTOR_BRIEF` fields:

```js
subject
action
camera
motion
lighting
environment
mood
audio
visual_goal
generation_intent
creator_performance_mode
speech_delivery_style
audience_connection
creator_energy
conversation_presence
microphone_importance
```

Because `DIRECTOR_BRIEF` appears before `AUDIO_GUIDANCE`, `SHOT_PLAN`, and `PROMPT_SLOTS`, all serialized fields in this subset should normally survive the final 3900-char payload unless the profile/template/brief itself becomes unusually large and `compactJson(brief, 900)` truncates later fields within the brief JSON.

### DIRECTOR_BRIEF Field Table

| Field | Serialized Size Estimate | Appears In Final Prompt | PromptSlots Duplication | Other Duplication | Uniqueness Score | Notes |
|---|---:|---:|---|---|---:|---|
| `subject` | 40-110 chars | yes, high confidence | `OPENING_VISUAL` | `SHOT_PLAN.opening_visual`, object/context fields | 8/10 | Core identity signal. Keep. |
| `action` | 50-150 chars | yes, high confidence | `PRIMARY_ACTION` | `SHOT_PLAN.primary_action`, `motion`, `generation_intent` | 8/10 | Core behavior signal. Keep. |
| `camera` | 35-100 chars | yes, high confidence | `CAMERA_BEHAVIOR` | `SHOT_PLAN.camera_behavior`, compact camera style when present | 7/10 | Important for validation and prompt direction. |
| `motion` | 90-260 chars | yes, high confidence | `PRIMARY_ACTION`, `SECONDARY_MOTION` | `SHOT_PLAN.primary_action`, `SHOT_PLAN.secondary_motion`, micro-motion | 5/10 | Large aggregate; strong compression target. |
| `lighting` | 25-100 chars | yes, high confidence | `VISUAL_FINISH` | `SHOT_PLAN.visual_finish` | 8/10 | Usually concise and valuable. |
| `environment` | 40-130 chars | yes, high confidence | `ENVIRONMENT_RESPONSE` | `SHOT_PLAN.environment_response` | 6/10 | Useful but duplicated by shot plan/slots. |
| `mood` | 20-90 chars | yes, high confidence | partial `VISUAL_FINISH` | `visual_goal`, platform style | 4/10 | Often abstract and duplicated. |
| `audio` | 40-170 chars | yes, high confidence | no direct slot | `AUDIO_GUIDANCE`, speech fields | 8/10 | Important for speech/music behavior despite duplication. |
| `visual_goal` | 50-170 chars | yes, high confidence | partial `OPENING_VISUAL` / `VISUAL_FINISH` | `generation_intent`, creator fields, object fields | 5/10 | Broad aggregate; compression target. |
| `generation_intent` | 90-280 chars | yes, high confidence unless brief JSON truncates | partial all slots | `visual_goal`, `motion`, creator fields | 4/10 | Largest low-uniqueness retained field. Strong target. |
| `creator_performance_mode` | 30-90 chars | yes, high confidence | partial `OPENING_VISUAL` | `subject`, `generation_intent` | 6/10 | Useful for creator authenticity. |
| `speech_delivery_style` | 40-110 chars | yes, high confidence | partial `PRIMARY_ACTION` | `audio`, `conversation_presence` | 6/10 | Useful only when speech exists. |
| `audience_connection` | 35-100 chars | yes, high confidence | partial camera/action slots | `camera`, `conversation_presence`, `generation_intent` | 4/10 | Often repeats direct-to-camera framing. |
| `creator_energy` | 35-110 chars | yes, high confidence | partial action/motion slots | `generation_intent`, `visual_goal` | 5/10 | Useful but often repeated. |
| `conversation_presence` | 35-110 chars | yes, high confidence | partial `PRIMARY_ACTION` | `speech_delivery_style`, `audio`, `audience_connection` | 4/10 | Strong compression candidate for speech reels. |
| `microphone_importance` | 35-120 chars | yes, high confidence when present | partial `OPENING_VISUAL` / `VISUAL_FINISH` | `subject`, `visual_goal`, `audio` | 7/10 when mic exists, 3/10 otherwise | Important only for podcast/mic reels. |

## SHOT_PLAN Survivors

`SHOT_PLAN` is serialized as:

```js
{
  order: shotPlanOrder,
  plan: {
    opening_visual,
    primary_action,
    secondary_motion,
    camera_behavior,
    environment_response,
    visual_finish
  }
}
```

It appears after `DIRECTOR_PROMPT`. Since over-budget prompts replace `DIRECTOR_PROMPT` with `{}`, `SHOT_PLAN` usually survives. However, it is closer to the 3900-char cutoff than `DIRECTOR_BRIEF`.

The internal field order makes `visual_finish` most vulnerable if `compactJson({order, plan}, 900)` is truncated or the global 3900 slice cuts the section.

### SHOT_PLAN Field Table

| Field | Serialized Size Estimate | Appears In Final Prompt | PromptSlots Duplication | DirectorBrief Duplication | Uniqueness Score | Notes |
|---|---:|---:|---|---|---:|---|
| `order` | 80-160 chars | yes, high confidence | `PROMPT_SLOTS.slotOrder` | none | 2/10 | Mostly duplicate ordering metadata. |
| `opening_visual` | 45-140 chars | yes, high confidence | `OPENING_VISUAL` | `subject` | 6/10 | Useful shot start, but duplicated. |
| `primary_action` | 40-150 chars | yes, high confidence | `PRIMARY_ACTION` | `action`, `motion` | 6/10 | Important but duplicated by slots. |
| `secondary_motion` | 30-160 chars | yes, high-to-medium confidence | `SECONDARY_MOTION` | `motion` | 5/10 | Often micro-motion; duplicated and sometimes low value. |
| `camera_behavior` | 45-120 chars | yes, high-to-medium confidence | `CAMERA_BEHAVIOR` | `camera` | 5/10 | Important but strongly duplicated. |
| `environment_response` | 40-130 chars | yes, medium confidence | `ENVIRONMENT_RESPONSE` | `environment` | 5/10 | Useful but duplicated; later in section. |
| `visual_finish` | 40-180 chars | yes, medium-to-low confidence | `VISUAL_FINISH` | `lighting`, `mood`, `environment`, `microphone_importance` | 5/10 | Most vulnerable shot-plan field; often overlaps lighting/mood. |

## PromptSlots Duplication Map

| Payload Field | PromptSlots Duplicate | Duplication Strength |
|---|---|---:|
| `DIRECTOR_BRIEF.subject` | `OPENING_VISUAL` | medium-high |
| `DIRECTOR_BRIEF.action` | `PRIMARY_ACTION` | high |
| `DIRECTOR_BRIEF.camera` | `CAMERA_BEHAVIOR` | medium-high |
| `DIRECTOR_BRIEF.motion` | `PRIMARY_ACTION`, `SECONDARY_MOTION` | high |
| `DIRECTOR_BRIEF.lighting` | `VISUAL_FINISH` | medium |
| `DIRECTOR_BRIEF.environment` | `ENVIRONMENT_RESPONSE` | high |
| `DIRECTOR_BRIEF.audio` | none | low |
| `DIRECTOR_BRIEF.visual_goal` | `OPENING_VISUAL`, `VISUAL_FINISH` | medium |
| `DIRECTOR_BRIEF.generation_intent` | all slot themes | medium |
| `SHOT_PLAN.order` | `slotOrder` | exact/near-exact |
| `SHOT_PLAN.opening_visual` | `OPENING_VISUAL` | exact/near-exact |
| `SHOT_PLAN.primary_action` | `PRIMARY_ACTION` | exact/near-exact |
| `SHOT_PLAN.secondary_motion` | `SECONDARY_MOTION` | exact/near-exact |
| `SHOT_PLAN.camera_behavior` | `CAMERA_BEHAVIOR` | exact/near-exact |
| `SHOT_PLAN.environment_response` | `ENVIRONMENT_RESPONSE` | exact/near-exact |
| `SHOT_PLAN.visual_finish` | `VISUAL_FINISH` | exact/near-exact |

## Uniqueness Ranking

Higher score means less duplicated and more likely to provide unique value to Gemini.

### Highest Uniqueness

1. `DIRECTOR_BRIEF.audio` - 8/10
2. `DIRECTOR_BRIEF.subject` - 8/10
3. `DIRECTOR_BRIEF.action` - 8/10
4. `DIRECTOR_BRIEF.lighting` - 8/10
5. `DIRECTOR_BRIEF.camera` - 7/10
6. `DIRECTOR_BRIEF.microphone_importance` - 7/10 when mic exists

### Lowest Uniqueness

1. `SHOT_PLAN.order` - 2/10
2. `DIRECTOR_BRIEF.generation_intent` - 4/10
3. `DIRECTOR_BRIEF.mood` - 4/10
4. `DIRECTOR_BRIEF.audience_connection` - 4/10
5. `DIRECTOR_BRIEF.conversation_presence` - 4/10
6. `SHOT_PLAN.*` fields - generally 5-6/10 because they are copied into `PROMPT_SLOTS`

## Character Consumption Ranking

Likely largest surviving fields:

1. `DIRECTOR_BRIEF.generation_intent`
2. `DIRECTOR_BRIEF.motion`
3. `DIRECTOR_BRIEF.visual_goal`
4. `SHOT_PLAN.visual_finish`
5. `SHOT_PLAN.secondary_motion`
6. `SHOT_PLAN.primary_action`
7. `DIRECTOR_BRIEF.audio`
8. `DIRECTOR_BRIEF.action`
9. `SHOT_PLAN.opening_visual`
10. `SHOT_PLAN.environment_response`
11. `DIRECTOR_BRIEF.environment`
12. `SHOT_PLAN.camera_behavior`
13. `DIRECTOR_BRIEF.speech_delivery_style`
14. `DIRECTOR_BRIEF.creator_energy`
15. `DIRECTOR_BRIEF.conversation_presence`

## Compression Opportunity Ranking

| Rank | Target | Why It Survives | Why It Is Compressible | Estimated Savings | Risk |
|---:|---|---|---|---:|---|
| 1 | `DIRECTOR_BRIEF.generation_intent` | early in prompt | long aggregate, low uniqueness | 80-220 chars | low-medium |
| 2 | `DIRECTOR_BRIEF.motion` | early in prompt | duplicates action, secondary motion, temporal/micro-motion | 80-180 chars | medium |
| 3 | `SHOT_PLAN.order` | usually survives | duplicated by `PROMPT_SLOTS.slotOrder` | 80-160 chars | low-medium |
| 4 | `SHOT_PLAN` fields duplicated by `PROMPT_SLOTS` | usually survives | near-exact slot source duplicate | 250-600 chars | medium-high |
| 5 | `DIRECTOR_BRIEF.visual_goal` | early in prompt | broad semantic aggregate | 50-150 chars | low-medium |
| 6 | creator speech cluster | early in prompt | repeated speech/presence intent | 100-250 chars | medium |
| 7 | `DIRECTOR_BRIEF.environment` | early in prompt | duplicated by environment slot | 30-90 chars | low-medium |

## Next Optimization Target

Best next target among fields that actually reach Gemini:

```txt
DIRECTOR_BRIEF.generation_intent
```

Reason:

- It appears early and survives reliably.
- It is often one of the largest retained fields.
- It is an aggregate of information already carried by subject/action/motion/visual_goal/creator fields.
- It has low uniqueness relative to its size.
- Existing `VP_COMPACT_DIRECTOR_INTENT` is already positioned to measure this.

Second target:

```txt
SHOT_PLAN.order
```

Reason:

- It survives inside `SHOT_PLAN`.
- It duplicates `PROMPT_SLOTS.slotOrder`.
- It is metadata rather than visual/factual content.
- Removing or compressing only `order` is lower risk than removing shot-plan content.

Third target:

```txt
SHOT_PLAN duplicated fields vs PROMPT_SLOTS
```

Reason:

- This is the biggest potential savings after profile/template compression.
- Risk is higher because current Stage 2 instructions reference both shot plan and prompt slots.

## Recommendation

Prioritize experiments in this order:

1. Continue validating `VP_COMPACT_DIRECTOR_INTENT=1`.
2. Add a narrow `SHOT_PLAN.order` serialization experiment.
3. Only after that, test a larger `SHOT_PLAN` vs `PROMPT_SLOTS` dedup experiment.

Avoid compressing these first:

- `subject`
- `action`
- `camera`
- `audio`
- `lighting`

They survive, but they carry high prompt value and support validation/quality scoring.

