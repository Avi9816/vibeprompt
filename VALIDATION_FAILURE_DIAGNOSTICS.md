# Validation Failure Diagnostics

This report documents the focused diagnostics added for prompt validation failures that can lead to `"Prompt generation incomplete"`.

## Runtime Log Marker

Every `validatePrompts()` failure path now emits:

```text
[prompt validation details]
```

Each log entry includes:

```json
{
  "platform": "veo",
  "field": "veo",
  "stage": "generateVideoPromptsWithRetry",
  "attempt": 1,
  "issues": ["veo: missing camera language"],
  "promptLength": 742,
  "promptPreview": "First 300 characters of the generated prompt...",
  "audioType": "speech",
  "speechLanguage": "Hindi",
  "expectedPlatforms": ["runway", "sora", "pika", "kling", "veo", "keyframe", "negative", "camera_spec", "style_tags"],
  "generatedPlatforms": ["runway", "sora", "pika", "kling", "veo", "keyframe", "negative", "camera_spec", "style_tags"],
  "missingPlatforms": []
}
```

This is intentionally separate from the broader `[prompt generation failure diagnostics]` snapshot so the exact failing platform and rule are visible immediately.

## `validatePrompts()` Call Sites

| File | Line | Caller | Purpose |
|---|---:|---|---|
| `backend/analyzer.js` | 5371 | `generateVideoPromptsWithRetry()` | Validates the complete generated video prompt set before accepting a Stage 2 attempt. |
| `backend/analyzer.js` | 5596 | `generateImagePromptsWithRetry()` | Validates the complete generated image prompt set before accepting a Stage 2 attempt. |
| `backend/analyzer.js` | 7194 | `generatePromptJSONWithRetry()` | Validates legacy/generic Stage 2 JSON responses before accepting them. |
| `backend/analyzer.js` | 7474 | `runAnalysis()` | Final safety validation after Stage 2 prompt generation returns. Converts remaining issues into `"Prompt generation incomplete"`. |

## Prompt Validation Throws

| File | Line | Throw | Condition |
|---|---:|---|---|
| `backend/analyzer.js` | 5391 | `throw new Error(\`Prompt validation failed: ...\`)` | Video prompt retry attempt produced validation issues. |
| `backend/analyzer.js` | 5616 | `throw new Error(\`Prompt validation failed: ...\`)` | Image prompt retry attempt produced validation issues. |
| `backend/analyzer.js` | 7214 | `throw new Error(\`Prompt validation failed: ...\`)` | Generic Stage 2 JSON retry attempt produced validation issues. |

Before each throw, `[prompt validation details]` now logs failing field/platform prompt previews and prompt lengths.

## Retry Loops

### `generateVideoPromptsWithRetry()`

Source: `backend/analyzer.js`, lines 5365-5407.

- Attempts: 2
- Generates: `runway`, `sora`, `pika`, `kling`, `veo`, `keyframe`, plus shared fields.
- On validation failure:
  - Logs `[prompt validation details]`
  - Logs `[prompt generation failure diagnostics]`
  - Throws `Prompt validation failed: ...`
  - Retries once with the same grounded inputs
- After retries fail:
  - Returns `diagnostic("Prompt generation incomplete", lastErr?.message || "Stage2 failed", ...)`

### `generateImagePromptsWithRetry()`

Source: `backend/analyzer.js`, lines 5590-5632.

- Attempts: 2
- Generates: `flux`, `midjourney`, `nano_banana`, `imagen`, `recraft`, `sdxl`, plus shared fields.
- On validation failure:
  - Logs `[prompt validation details]`
  - Logs `[prompt generation failure diagnostics]`
  - Throws `Prompt validation failed: ...`
  - Retries once with the same grounded inputs
- After retries fail:
  - Returns `diagnostic("Prompt generation incomplete", lastErr?.message || "Stage2 failed", ...)`

### `generatePromptJSONWithRetry()`

Source: `backend/analyzer.js`, lines 7178-7230.

- Attempts: 2
- Used by generic Stage 2 JSON generation paths.
- On validation failure:
  - Logs `[prompt validation details]`
  - Logs `[prompt generation failure diagnostics]`
  - Throws `Prompt validation failed: ...`
- After retries fail:
  - Returns `diagnostic("Prompt generation incomplete", lastErr?.message || `${stage} failed`, ...)`

## Places Validation Issues Become `"Prompt generation incomplete"`

| File | Line | Conversion |
|---|---:|---|
| `backend/analyzer.js` | 5406 | Video retry exhaustion returns `diagnostic("Prompt generation incomplete", ...)`. |
| `backend/analyzer.js` | 5631 | Image retry exhaustion returns `diagnostic("Prompt generation incomplete", ...)`. |
| `backend/analyzer.js` | 7229 | Generic Stage 2 retry exhaustion returns `diagnostic("Prompt generation incomplete", ...)`. |
| `backend/analyzer.js` | 7494 | Final `runAnalysis()` validation issues return `diagnostic("Prompt generation incomplete", issues.join("; "), ...)`. |
| `backend/server.js` | 361 | Analyzer result with `raw.error === "Prompt generation incomplete"` is returned as HTTP 422. |

## Validation Rules

Source: `backend/analyzer.js`, `validatePrompts()`, lines 7094-7168.

### Required Fields

For video:

```json
["runway", "sora", "pika", "kling", "veo", "keyframe", "negative", "camera_spec", "style_tags"]
```

For image:

```json
["flux", "midjourney", "nano_banana", "imagen", "recraft", "sdxl", "negative", "camera_spec", "style_tags"]
```

### Field Completeness

- Empty array field: `${field}: empty array item`
- Missing or too-short field: `${field}: empty or too short`
- Prompt without terminal punctuation: `${field}: likely truncated`

### Video Platform Prompt Rules

Applied to:

```json
["runway", "sora", "pika", "kling", "veo"]
```

Rules:

- Word count below 60: `${field}: fewer than 60 words`
- No motion language or accepted abstract/static motion: `${field}: missing motion description`
- No camera language: `${field}: missing camera language`
- Caption-like opening: `${field}: caption-like opening`

### Audio Rules

Based on `factual.audio_type`:

- `speech` without speech wording: `${field}: missing speech audio guidance`
- `music` without music wording: `${field}: missing music audio guidance`
- `speech_and_music` missing speech wording: `${field}: missing speech audio guidance`
- `speech_and_music` missing music wording: `${field}: missing music audio guidance`
- `ambient_audio` without ambient wording: `${field}: missing ambient audio guidance`
- `none` with speech or music wording: `${field}: invents dialogue or music audio`

The diagnostics include both:

```json
{
  "audioType": "...",
  "speechLanguage": "..."
}
```

### Image Prompt Rules

For image platform prompts:

- Any video motion/camera language triggers: `${field}: contains video motion/camera language`

## Added Diagnostic Helper

Source: `backend/analyzer.js`, lines 5789-5837.

`logPromptValidationDetails()` groups validation issues by field and logs:

- `platform`
- `field`
- `issues`
- `promptLength`
- `promptPreview`
- `audioType`
- `speechLanguage`
- `expectedPlatforms`
- `generatedPlatforms`
- `missingPlatforms`

## Verification

Passed:

```text
node --check backend\analyzer.js
```
