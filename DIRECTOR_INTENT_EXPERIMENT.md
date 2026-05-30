# Director Intent Compression Experiment

## Goal

Measure whether retained `DIRECTOR_BRIEF` payload can be reduced by compressing only the broad intent fields:

- `generation_intent`
- `visual_goal`

Feature flag:

```txt
VP_COMPACT_DIRECTOR_INTENT=1
```

## Files Modified

- `backend/analyzer.js`

## Scope

This experiment only affects the serialized `DIRECTOR_BRIEF` payload inside final Stage 2 Gemini assembly.

It does not change the full DirectorBrief object produced by `buildDirectorBrief()` for downstream refinement, validation, master prompt generation, or guardrails.

## Fields Preserved

The following retained `DIRECTOR_BRIEF` fields are preserved unchanged:

- `subject`
- `action`
- `camera`
- `motion`
- `lighting`
- `environment`
- `mood`
- `audio`
- `creator_performance_mode`
- `speech_delivery_style`
- `audience_connection`
- `creator_energy`
- `conversation_presence`
- `microphone_importance`

## Original Fields

Before the experiment, the retained Stage 2 `DIRECTOR_BRIEF` serialized:

```js
visual_goal: directorBrief.visual_goal
generation_intent: directorBrief.generation_intent
```

Both fields can be long aggregate strings assembled from creator performance, reel energy, archetype, temporal progression, attention direction, workflow, object focus, and audience intent.

## Compressed Fields

When enabled, both fields are compressed to a single concise phrase:

```js
visual_goal: compactDirectorIntentPhrase(directorBrief.visual_goal)
generation_intent: compactDirectorIntentPhrase(directorBrief.generation_intent)
```

Compression behavior:

- split on phrase boundaries: `.`, `;`, `|`
- keep the first usable phrase
- cap the phrase at 14 words

This keeps the leading intent signal while removing repeated secondary clauses.

## Diagnostics

Added:

```txt
[director intent experiment]
{
  "enabled": true,
  "originalIntentChars": 180,
  "compressedIntentChars": 62,
  "originalVisualGoalChars": 120,
  "compressedVisualGoalChars": 45,
  "charsSaved": 193
}
```

When disabled:

```txt
[director intent experiment]
{
  "enabled": false,
  "originalIntentChars": 180,
  "compressedIntentChars": 180,
  "originalVisualGoalChars": 120,
  "compressedVisualGoalChars": 120,
  "charsSaved": 0
}
```

## Estimated Savings

Expected savings:

```txt
140-350 chars
```

Actual savings depend on how many semantic intelligence layers contributed to:

- creator intent
- temporal progression
- attention direction
- motion energy
- creator archetype
- audio and speech delivery
- product/object focus

## Expected Prompt Impact

Expected impact should be limited because core factual guidance remains untouched:

- subject remains
- action remains
- camera remains
- motion remains
- lighting remains
- environment remains
- audio remains
- creator-performance fields remain
- shot plan remains
- prompt slots remain

The experiment removes repeated semantic reinforcement, not core facts.

## Comparison Checklist

Run the same sample with:

```txt
VP_COMPACT_DIRECTOR_INTENT=0
VP_COMPACT_DIRECTOR_INTENT=1
```

Compare:

- `[director intent experiment]`
- `[compressed prompt]`
- `[stage2 final prompt]`
- generated platform prompts
- prompt validation diagnostics
- prompt quality logs
- platform alignment logs

## Risk Assessment

Risk: low-to-medium.

Reason:

- Only two broad aggregate fields are shortened.
- The core retained DirectorBrief fields remain intact.
- Prompt slots and shot plan are unaffected.

Potential regression:

- Slightly weaker creator/social-video nuance if the strongest intent phrase is not first.

Best success signal:

- measurable Stage 2 prompt length reduction
- no validation regression
- no quality-score regression
- generated prompts retain social-video intent and platform differentiation

