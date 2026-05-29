# Prompt Generation Failure Report

Generated for the diagnostic pass investigating `"Prompt generation incomplete"`.

## Summary

The user-facing `"Prompt generation incomplete"` result is produced in `backend/analyzer.js` when Stage 2 prompt generation exhausts retries or when final prompt validation returns issues after generation. The backend route in `backend/server.js` then returns that analyzer diagnostic as HTTP 422.

Temporary diagnostics were added before the prompt-generation failure points. They log:

```json
{
  "expectedPlatforms": [],
  "generatedPlatforms": [],
  "missingPlatforms": [],
  "promptKeys": [],
  "promptLengths": {},
  "issues": [],
  "actualRuntimeFields": {
    "content_type": "",
    "reel_type": "",
    "audio_type": "",
    "speech_present": false,
    "confidence_speech": 0,
    "generation_mode": ""
  }
}
```

The primary diagnostic marker is:

```text
[prompt generation failure diagnostics]
```

The server-side HTTP 422 marker is:

```text
[prompt generation incomplete response]
```

## Source Locations

| Source file | Line | Triggering condition | Required fields | Runtime values now logged |
|---|---:|---|---|---|
| `backend/analyzer.js` | 4598 | `isModernVideoPlatform(field) && !stage2AssemblyReady(activePrompt)` remains true after attempting to rebuild the platform prompt. Throws `${field}: Stage2 assembly missing required modern modules`. | For modern video platforms: `DIRECTOR_BRIEF`, `DIRECTOR_PROMPT`, `SHOT_PLAN`, `PLATFORM_TEMPLATE` must all be included in the Stage 2 assembly. | `platform`, `field`, `attempt`, `promptChars`, `assembly`, `factualKeys`, `actualRuntimeFields`. |
| `backend/analyzer.js` | 4647 | `value.length < 20` after AI generation, refinement, optimization, translation, guardrails, and final polish. Throws `${field}: empty or too short`. | Current platform field must be a non-empty prompt of at least 20 characters. | `platform`, `field`, `attempt`, `rawChars`, `valueChars`, `promptChars`, `assembly`, `factualKeys`, `actualRuntimeFields`. |
| `backend/analyzer.js` | 5383 | In video generation retry loop: `validatePrompts({ factual, prompts }, mediaType)` returns one or more issues. Throws `Prompt validation failed: ...`. | Video expected fields: `runway`, `sora`, `pika`, `kling`, `veo`, `keyframe`, `negative`, `camera_spec`, `style_tags`. | `expectedPlatforms`, `generatedPlatforms`, `missingPlatforms`, `promptKeys`, `promptLengths`, `issues`, `factualKeys`, `actualRuntimeFields`. |
| `backend/analyzer.js` | 5398 | Video generation retries are exhausted and `lastErr` remains set. Returns `diagnostic("Prompt generation incomplete", lastErr?.message || "Stage2 failed", ...)`. | Same video fields as above, plus all validation requirements. | `stage`, `mediaType`, `factualKeys`, `actualRuntimeFields`, `error` stack/message. |
| `backend/analyzer.js` | 5600 | In image generation retry loop: `validatePrompts({ factual, prompts }, mediaType)` returns one or more issues. Throws `Prompt validation failed: ...`. | Image expected fields: `flux`, `midjourney`, `nano_banana`, `imagen`, `recraft`, `sdxl`, `negative`, `camera_spec`, `style_tags`. | `expectedPlatforms`, `generatedPlatforms`, `missingPlatforms`, `promptKeys`, `promptLengths`, `issues`, `factualKeys`, `actualRuntimeFields`. |
| `backend/analyzer.js` | 5615 | Image generation retries are exhausted and `lastErr` remains set. Returns `diagnostic("Prompt generation incomplete", lastErr?.message || "Stage2 failed", ...)`. | Same image fields as above, plus all validation requirements. | `stage`, `mediaType`, `factualKeys`, `actualRuntimeFields`, `error` stack/message. |
| `backend/analyzer.js` | 5638 | `extractJSON(text, stage)` cannot repair/parse a model response as JSON. Throws `${stage} invalid JSON...`. This can become `"Prompt generation incomplete"` if Stage 2 retries exhaust. | Valid JSON object from the model response. | For Stage 2 only: `rawChars`, response preview via error text, and diagnostic label `Stage2 invalid JSON before throw`. |
| `backend/analyzer.js` | 7132 | Generic Stage 2 JSON retry path: `validatePrompts(parsed.prompts ? parsed : { prompts: parsed }, mediaType)` returns issues. Throws `Prompt validation failed: ...`. | Expected video/image fields based on `mediaType`. | `expectedPlatforms`, `generatedPlatforms`, `missingPlatforms`, `promptKeys`, `promptLengths`, `issues`, `rawChars`. |
| `backend/analyzer.js` | 7147 | Generic Stage 2 JSON retries are exhausted. Returns `diagnostic("Prompt generation incomplete", lastErr?.message || `${stage} failed`, ...)`. | Valid and complete prompt JSON for the requested media type. | `stage`, `mediaType`, `error` stack/message. |
| `backend/analyzer.js` | 7405 | Final `runAnalysis()` validation: `validatePrompts(parsed, mediaType)` returns issues after Stage 2 prompt generation has returned. Returns `diagnostic("Prompt generation incomplete", issues.join("; "), ...)`. | Complete prompt set for the resolved `mediaType`. | `expectedPlatforms`, `generatedPlatforms`, `missingPlatforms`, `promptKeys`, `promptLengths`, `issues`, `factualKeys`, `actualRuntimeFields`. |
| `backend/server.js` | 361 | Analyzer returned `raw.error === "Prompt generation incomplete"`. Route returns HTTP 422 with analyzer payload. | Analyzer result must not contain an `error` field. | `error`, `reason`, `mediaType`, `frameCount`, `debugStages`, `payloadShape`. |

## Validation Conditions Inside `validatePrompts()`

Source: `backend/analyzer.js`, lines 7022-7094.

For each required field:

- Empty arrays or array items trigger: `${field}: empty array item`
- Missing values or values shorter than required length trigger: `${field}: empty or too short`
- Prompt fields without terminal punctuation trigger: `${field}: likely truncated`
- Video platform prompts below 60 words trigger: `${field}: fewer than 60 words`
- Video prompts with no motion language, abstract action, or accepted static composition trigger: `${field}: missing motion description`
- Video prompts with no camera language trigger: `${field}: missing camera language`
- Caption-like openings trigger: `${field}: caption-like opening`
- `audio_type === "speech"` without speech wording triggers: `${field}: missing speech audio guidance`
- `audio_type === "music"` without music wording triggers: `${field}: missing music audio guidance`
- `audio_type === "speech_and_music"` missing either speech or music wording triggers the corresponding audio guidance issue
- `audio_type === "ambient_audio"` without ambient audio wording triggers: `${field}: missing ambient audio guidance`
- `audio_type === "none"` with speech or music wording triggers: `${field}: invents dialogue or music audio`
- Image platform prompts containing video motion/camera wording trigger: `${field}: contains video motion/camera language`

When any validation issue exists, diagnostics are emitted with:

```text
[prompt generation failure diagnostics]
label: "validatePrompts issues"
```

## Non-Prompt Throws Found By Repository Search

These `throw new Error(...)` sites were found, but they are not direct sources of `"Prompt generation incomplete"`:

- `extension/popup.js:77`: test fetch failure, throws `not ok`.
- `extension/content.js:852`: frame extraction blocked by Instagram.
- `extension/content.js:859`: no video element found.
- `extension/content.js:871`: image capture failure.
- `extension/content.js:909`, `1312`, `1366`: frontend HTTP error propagation.
- `backend/server.js:60`, `129`: feedback/benchmark rating validation.
- `backend/analyzer.js:242`, `244`, `246`: local image/frame validation for file input.
- `backend/analyzer.js:6075`: `ffmpeg-static` unavailable.
- `backend/analyzer.js:6889`, `6962`: no AI provider key.
- `backend/analyzer.js:7163`: Stage 1 validation failure; returns `"Factual analysis incomplete"` rather than `"Prompt generation incomplete"` for the normal Stage 1 path.

## Added Diagnostics

### `collectPromptFailureDiagnostics()`

Added to `backend/analyzer.js`. It captures expected platform fields, actual prompt keys, missing fields, prompt lengths, factual keys, and key runtime facts.

### `logPromptFailureDiagnostics()`

Added to `backend/analyzer.js`. It emits JSON under:

```text
[prompt generation failure diagnostics]
```

### Server 422 diagnostics

Added to `backend/server.js` for analyzer results where:

```js
raw.error === "Prompt generation incomplete"
```

This logs:

```json
{
  "error": "Prompt generation incomplete",
  "reason": "...",
  "mediaType": "video",
  "frameCount": 0,
  "debugStages": [],
  "payloadShape": {}
}
```

## Verification

Passed:

```text
node --check backend\analyzer.js
node --check backend\server.js
```
