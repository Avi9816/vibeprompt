# Keyframe Failure Root Cause

## Summary

`keyframe` is generated as part of the video prompt batch, but it is not considered a modern video platform by `isModernVideoPlatform()`.

That explains the confusing diagnostics:

```json
{
  "mediaType": "image",
  "expectedPlatforms": [
    "flux",
    "midjourney",
    "nano_banana",
    "imagen",
    "recraft",
    "sdxl",
    "negative",
    "camera_spec",
    "style_tags"
  ]
}
```

Those image expectations come from diagnostics inside `generatePlatformField()`, not from the actual video aggregate validation path.

The observed `Keyframe invalid JSON` failure happens earlier than final video validation:

```text
generatePlatformField()
  -> callAI(activePrompt, KEYFRAME_SYSTEM, [], dbg)
  -> extractJSON(raw, "Keyframe")
  -> throws "Keyframe invalid JSON" when raw is empty or not parseable JSON
```

## Exact Call Chain

### 1. `generateVideoPromptsByPlatform()`

Source: `backend/analyzer.js`

```js
const results=await Promise.all([
  generateRunwayPrompt(factual,stylePreset,dbg,generationMode),
  generateSoraPrompt(factual,stylePreset,dbg,generationMode),
  generateKlingPrompt(factual,stylePreset,dbg,generationMode),
  generateVeoPrompt(factual,stylePreset,dbg,generationMode),
  generatePikaPrompt(factual,stylePreset,dbg,generationMode),
  generateKeyframePrompt(factual,stylePreset,dbg),
].map(settle));
```

`keyframe` runs in parallel with the five video platforms.

If any platform fails:

```js
const failed=results.find(r=>!r.ok);
if(failed) throw failed.error;
```

So a keyframe-only failure causes the entire Stage 2 video generation attempt to fail, even if `veo`, `runway`, `sora`, `kling`, and `pika` generated successfully.

### 2. `generateKeyframePrompt()`

Source: `backend/analyzer.js`

```js
function generateKeyframePrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"keyframe",
    label:"Keyframe",
    systemPrompt:KEYFRAME_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("keyframe",factual,stylePreset,`KEYFRAME focus:
- pure still image description
- visible subject or object details
- composition
- lighting
- environment and materials
- lens feel

Do not include motion, camera movement, scene progression, or video direction.`),
  });
}
```

### 3. `generatePlatformField()`

Source: `backend/analyzer.js`

Relevant flow:

```js
const raw=await callAI(activePrompt,systemPrompt,[],dbg);
dbg.log(label,"Response",{attempt,chars:raw.length,preview:raw.slice(0,200)});
const parsed=extractJSON(raw,label);
let value=String(parsed?.[field]||"").trim();
```

For keyframe:

```js
label === "Keyframe"
field === "keyframe"
systemPrompt === KEYFRAME_SYSTEM
```

The error:

```text
Keyframe invalid JSON
```

comes from:

```js
extractJSON(raw, "Keyframe")
```

not from `validatePrompts()`.

### 4. `extractJSON()`

Source: `backend/analyzer.js`

```js
function extractJSON(text,stage) {
  const r=repairJSON(text);
  if(r) return r;
  throw new Error(`${stage} invalid JSON. Preview: ${text.slice(0,300)}`);
}
```

For keyframe, this becomes:

```text
Keyframe invalid JSON. Preview: ...
```

If the model response is empty, the preview is empty.

## Prompt Sent To Gemini

The keyframe prompt is built by:

```js
buildPlatformPrompt("keyframe", factual, stylePreset, KEYFRAME instructions)
```

There are two possible prompt branches.

## Branch A: Prompt Intelligence Disabled

Condition:

```js
if(!intelligenceEnabled && !modernVideoPlatform) {
  return buildLegacyPlatformPrompt(...)
}
```

For keyframe:

```js
modernVideoPlatform === false
```

So when `VP_PROMPT_INTELLIGENCE` is not enabled, keyframe uses `buildLegacyPlatformPrompt()`.

The legacy prompt begins:

```text
Generate the KEYFRAME field using the existing grounded generation system.

STAGE_1_FACTS:
...

GROUNDING PRIORITY:
...

MOTION_SYNTHESIS:
...

...

PLATFORM DIRECTIONS:
KEYFRAME focus:
- pure still image description
- visible subject or object details
- composition
- lighting
- environment and materials
- lens feel

Do not include motion, camera movement, scene progression, or video direction.

GROUNDING RULES:
...
- Return only valid JSON: {"keyframe":"55-75 words."}
```

This branch is internally coherent enough for keyframe: it asks for a `keyframe` JSON field and the `KEYFRAME_SYSTEM` asks for a still-frame image description.

## Branch B: Prompt Intelligence Enabled

Condition:

```js
if(!intelligenceEnabled && !modernVideoPlatform) { ... }
```

When `VP_PROMPT_INTELLIGENCE=1`, the early legacy return is skipped even though:

```js
field === "keyframe"
modernVideoPlatform === false
isVideoPlatform === false
```

That causes keyframe to go through the modern assembly path with video-oriented compression machinery, but most modern video-only modules are intentionally disabled:

```js
const isVideoPlatform = field !== "keyframe";

const socialCameraIntelligence = isVideoPlatform ? ... : {};
const creatorIntent = isVideoPlatform ? ... : {};
const platformTemplate = isVideoPlatform ? ... : null;
const directorPrompt = platformTemplate ? ... : null;
const shotPlan = isVideoPlatform ? ... : null;
const promptSlots = shotPlan ? ... : null;
const directorBrief = isVideoPlatform ? ... : null;
const audioPromptGuidance = isVideoPlatform ? ... : "";
```

Then keyframe still reaches:

```js
compressStage2Assembly({
  field: "keyframe",
  compactTemplate: null,
  promptProfile: null,
  referencePattern: null,
  directorBrief: null,
  audioPromptGuidance: "",
  compactDirector: null,
  shotPlanOrder: [],
  shotPlan: null,
  promptSlots: null,
  compactContext,
  ...
})
```

This produces a compressed Stage 2 prompt shaped like:

```text
Generate JSON only: {"keyframe":"55-75 words."}

PLATFORM_PROFILE:
{"structure":[],"style":"","emphasis":{},"ideal_length":{},"avoid":[],"writing":[],"pattern":null}

PLATFORM_TEMPLATE:
{}

DIRECTOR_BRIEF:
{}

AUDIO_GUIDANCE:
none

DIRECTOR_PROMPT:
{}

SHOT_PLAN:
{"order":[],"plan":null}

PROMPT_SLOTS:
null

COMPACT_CONTEXT:
...

RULES:
- Build the prompt from PROMPT_SLOTS in order.
- Keep subject, action, camera, motion, lighting, audio, profile, and shot plan.
- Write native KEYFRAME generative video language, not analysis.
- Platform style: grounded visual generation prompt.
...
```

This is the most suspicious branch.

Why:

- `PROMPT_SLOTS` is `null`.
- `SHOT_PLAN` is `null`.
- `DIRECTOR_BRIEF` is `{}`.
- `PLATFORM_TEMPLATE` is `{}`.
- The rules still say: `Build the prompt from PROMPT_SLOTS in order.`
- The rules also say: `Write native KEYFRAME generative video language`, even though `KEYFRAME_SYSTEM` says pure still-frame image description and no motion language.

That contradiction can plausibly cause Gemini to return an empty or malformed response for keyframe only.

## Why `mediaType = "image"` Appears During Video Generation

This comes from diagnostics inside `generatePlatformField()`:

```js
mediaType:isModernVideoPlatform(field) ? "video" : "image"
```

For keyframe:

```js
isModernVideoPlatform("keyframe") === false
```

So diagnostics call:

```js
expectedPromptFields("image")
```

which produces:

```json
[
  "flux",
  "midjourney",
  "nano_banana",
  "imagen",
  "recraft",
  "sdxl",
  "negative",
  "camera_spec",
  "style_tags"
]
```

This does not prove keyframe is routed through image generation. It proves the diagnostics classify non-modern platforms as image.

Actual routing:

```text
generateVideoPromptsByPlatform()
  -> generateKeyframePrompt()
```

So keyframe is being generated inside the video run.

## Why Keyframe Returns Empty Or Invalid JSON

The code path shows the direct cause:

```js
const raw = await callAI(activePrompt, KEYFRAME_SYSTEM, [], dbg);
const parsed = extractJSON(raw, "Keyframe");
```

`extractJSON()` only throws `Keyframe invalid JSON` when `repairJSON(raw)` returns `null`.

That means one of these happened:

1. Gemini returned an empty string.
2. Gemini returned non-JSON text.
3. Gemini returned JSON that could not be repaired into an object.
4. Gemini returned JSON that did not begin with `{`.

The current code logs this before parsing:

```js
dbg.log("Keyframe","Response",{
  attempt,
  chars: raw.length,
  preview: raw.slice(0,200)
});
```

So the exact runtime proof should be in the debug log under the `Keyframe` response entry.

Static code indicates the likely reason is prompt contradiction in the prompt-intelligence-enabled branch:

- It asks for KEYFRAME.
- It uses video-oriented Stage 2 assembly rules.
- It requires construction from `PROMPT_SLOTS`.
- But keyframe intentionally does not build prompt slots.
- It tells the model to write `KEYFRAME generative video language`.
- But `KEYFRAME_SYSTEM` tells the model to write a pure still-frame image description with no motion.

## Should Keyframe Use Video Validation, Image Validation, Or Bypass Validation?

Based on the current architecture, keyframe is a video-run companion field, not a standalone image-platform prompt.

Recommended classification from the audit:

```text
keyframe should use video-run required-field validation only.
```

That means:

- It should be required during video generation.
- It should be checked for existence and reasonable length.
- It should not be evaluated against the five video platform prompt rules:
  - no 60-word video-platform minimum unless intentionally desired
  - no required motion description
  - no required camera movement/video direction
  - no speech/music guidance requirement
- It should not use image-platform expectations like `flux`, `midjourney`, `nano_banana`, `imagen`, `recraft`, `sdxl`.

Current aggregate video validation already mostly does this:

```js
const promptFields = ["runway","sora","pika","kling","veo"];
const requiredFields = [...promptFields, "keyframe", "negative", "camera_spec", "style_tags"];
```

Rules specific to video platform prompts only apply when:

```js
promptFields.includes(field)
```

Since `keyframe` is not in `promptFields`, it only receives required-field validation.

So the validation model is already correct at the final video aggregate level.

The wrong `image` expectation appears only in per-field diagnostics and failure logging.

## Current Status

| Question | Answer |
|---|---|
| Is keyframe generated inside the video run? | Yes. |
| Does keyframe call `generatePlatformField()`? | Yes. |
| Does keyframe use `KEYFRAME_SYSTEM`? | Yes. |
| Does keyframe parse with `extractJSON(raw, "Keyframe")`? | Yes. |
| Does `Keyframe invalid JSON` come from `validatePrompts()`? | No. It comes from `extractJSON()`. |
| Why does diagnostics show `mediaType=image`? | Because `generatePlatformField()` maps every non-modern video platform to image for diagnostics. |
| Does final video validation expect keyframe? | Yes. |
| Does final video validation apply video platform motion/audio/camera rules to keyframe? | No. |
| Does backend still require keyframe during video generation? | Yes. |

## Root Cause

There are two distinct issues:

### Root Cause 1: Misleading Diagnostics

`generatePlatformField()` uses:

```js
mediaType:isModernVideoPlatform(field) ? "video" : "image"
```

For `keyframe`, this reports `image`, which causes image-platform expected fields to appear in the failure diagnostics.

This is diagnostic misclassification, not actual request routing.

### Root Cause 2: Keyframe Can Enter Modern Video Assembly With Empty Modern Modules

When prompt intelligence is enabled, `keyframe` bypasses the legacy prompt branch and enters `compressStage2Assembly()` with:

```js
platformTemplate = null
directorPrompt = null
shotPlan = null
promptSlots = null
directorBrief = null
promptProfile = null
referencePattern = null
```

The resulting prompt still instructs Gemini to build from `PROMPT_SLOTS` and write `KEYFRAME generative video language`.

This conflicts with `KEYFRAME_SYSTEM`, which requests a pure still-frame image description and no motion language.

This is the most likely reason keyframe returns an empty or invalid JSON response while the five video platforms succeed.

## No Code Changes Made

This is an investigation-only report. No fixes, refactors, validation changes, or prompt changes were made.
