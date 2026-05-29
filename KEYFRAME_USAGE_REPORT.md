# Keyframe Usage Report

## Summary

`keyframe` is currently a video-run companion prompt generated alongside `veo`, `runway`, `sora`, `kling`, and `pika`. It is returned by the API and included in JSON exports, but it is not shown as a visible platform prompt for video results.

The only hard runtime dependency found is video prompt validation: video responses currently require `keyframe` to be present and non-empty.

## Producers

| File | Function / location | Producer type | Output |
|---|---|---|---|
| `backend/analyzer.js` | `KEYFRAME_SYSTEM` | System prompt | Defines keyframe as a pure still-frame image description with no motion language. |
| `backend/analyzer.js` | `s2Prompt()` video schema | Legacy/generic schema producer | Lists `"keyframe": "55-75 word still-image prompt."` in the old all-in-one video JSON schema. |
| `backend/analyzer.js` | `s2Prompt()` image schema | Legacy/generic schema producer | Lists `"keyframe": "60-90 word image prompt."` in the old all-in-one image JSON schema. This does not appear to be used by the current per-platform image generation path. |
| `backend/analyzer.js` | `generateKeyframePrompt()` | Active producer | Calls `generatePlatformField({ field: "keyframe", label: "Keyframe", systemPrompt: KEYFRAME_SYSTEM, prompt: buildPlatformPrompt("keyframe", ...) })`. |
| `backend/analyzer.js` | `generateVideoPromptsByPlatform()` | Active aggregator | Runs `generateKeyframePrompt()` in parallel with the five video platforms, then stores the result as `prompts.keyframe`. |
| `backend/analyzer.js` | `buildLegacyPlatformPrompt()` | Prompt builder | Produces a keyframe prompt request with target length `55-75 words` when used for `field === "keyframe"`. |
| `backend/analyzer.js` | `compressStage2Assembly()` via `buildPlatformPrompt("keyframe", ...)` | Prompt builder when prompt intelligence is enabled | Can generate a compressed keyframe request, though keyframe has no prompt slots/shot plan/director brief in this path. |

## Consumers

| File | Function | Purpose | Required or optional |
|---|---|---|---|
| `backend/analyzer.js` | `generateVideoPromptsByPlatform()` | Reads the settled keyframe generation result and includes it in the final video `prompts` object. If the keyframe promise rejects, the whole video prompt generation attempt fails. | Required by current flow. |
| `backend/analyzer.js` | `validatePrompts()` | Requires `keyframe` as part of video `requiredFields`: `runway`, `sora`, `pika`, `kling`, `veo`, `keyframe`, `negative`, `camera_spec`, `style_tags`. It only checks required-field completeness for keyframe; video platform motion/camera/audio rules do not apply to keyframe. | Required for video validation. |
| `backend/analyzer.js` | `expectedPromptFields("video")` | Includes `keyframe` in diagnostic expected fields for video prompt failures. | Diagnostic only. |
| `backend/promptGenerator.js` | `generatePrompts()` | Copies `p?.keyframe || ""` into the public API response under `result.prompts.keyframe`. | Optional for API shape, but currently exposed. |
| `backend/promptGenerator.js` | `generatePrompts()` primary prompt fallback for images | For non-video media, primary prompt fallback is `p?.flux || p?.keyframe || p?.midjourney || ""`. Since current image generation does not actively produce keyframe, this is usually fallback-only/dead in normal image flow. | Optional fallback. |
| `extension/content.js` | `buildOverlay()` | Adds `Keyframe` to `imageTools`, not `videoTools`. Therefore keyframe can be shown as an image-mode platform card if present, but is not displayed in the video platform accordion. | Optional UI display for image mode only. |
| `extension/content.js` | `Copy All` handler | Copies every entry in `data.prompts` except `primary`; this includes `keyframe` when present in the API response. | Optional export/copy consumer. |
| `extension/content.js` | JSON Export button | Downloads the full `data` object. Since API responses include `prompts.keyframe`, JSON export includes it. | Optional export consumer. |
| `extension/popup.js` | `loadHistory()` preview fallback | Uses `item.prompts?.keyframe` late in the preview fallback chain after master, primary, platform prompts, flux, and midjourney. | Optional fallback. |
| `extension/popup.js` | `videoPromptButtons()` | Does not include keyframe. History copy buttons are only master, veo, sora, runway, kling, pika. | Not consumed. |
| `benchmark/benchmark.js` | `normalizeBenchmarkCase()` / `saveBenchmarkCase()` | Benchmark cases store `master_prompt`, `platform_prompt`, and `veo_prompt`, not keyframe. | Not consumed. |
| `benchmark/*.json` templates/cases | Benchmark data | No keyframe field in benchmark schemas or sample cases. | Not consumed. |
| `backend/server.js` | `/prompt-feedback`, `/quick-benchmark` | Stores selected prompt/master/Veo fields only. No direct keyframe storage field. | Not consumed directly. |

## Feature Checks

### Displayed In UI

Partially.

- Video result UI: **not displayed**. `videoTools` only includes `veo`, `sora`, `runway`, `kling`, and `pika`.
- Image result UI: **can be displayed** if `prompts.keyframe` exists. `imageTools` includes `Keyframe`.
- Copy All: **included** because it iterates all prompt keys.
- JSON Export: **included** because it downloads the full result object.

### Returned In API Responses

Yes.

`backend/promptGenerator.js` always includes:

```js
keyframe: p?.keyframe || ""
```

inside:

```js
result.prompts
```

### Used By Image Generation

Not in the current active per-platform image generator.

Current image generation produces:

```text
flux
midjourney
nano_banana
imagen
recraft
sdxl
```

`keyframe` remains in older generic schemas and image-primary fallback logic, but there is no active `generateKeyframePrompt()` call in `generateImagePromptsByPlatform()`.

### Used By Validation

Yes, for video required-field validation.

Current video validation:

```js
const promptFields = ["runway","sora","pika","kling","veo"];
const requiredFields = [...promptFields, "keyframe", "negative", "camera_spec", "style_tags"];
```

Important detail:

`keyframe` is required to be present and at least 20 chars, but it is not validated for video motion/camera/audio rules because those checks only run for fields in `promptFields`.

### Used By Benchmarking

No direct usage found.

Benchmark files use:

```text
master_prompt
platform_prompt
veo_prompt
generated_video
scores
issues
strengths
notes
```

No benchmark template, sample case, quick benchmark schema, or benchmark summary path requires `keyframe`.

### Used By Exports

Yes.

- JSON export downloads full `data`, so `prompts.keyframe` is included when returned by the backend.
- Copy All includes `keyframe` because it copies every `data.prompts` entry except `primary`.

### Used By Future-Generation Workflows

No active code path was found that sends `keyframe` into a future generation workflow.

Potential intended future use:

- A still reference frame prompt for image generation.
- A keyframe prompt for image-to-video workflows.
- A visual anchor for video generation.

But current code does not consume it for generation after it is returned.

## If Keyframe Generation Is Removed Entirely

### Affected Features

| Feature | Impact |
|---|---|
| Video Stage 2 generation | Currently breaks unless validation and aggregation are adjusted, because `generateVideoPromptsByPlatform()` expects a keyframe result and `validatePrompts()` requires `keyframe`. |
| API response | `result.prompts.keyframe` would become `""` or disappear depending on `promptGenerator.js` behavior. |
| JSON export | Export would no longer contain a useful keyframe field. |
| Copy All | Copy All would no longer include keyframe for video results. |
| Image UI platform card | If an image response somehow had `keyframe`, it would no longer show; current active image generation likely unaffected because it does not produce keyframe. |
| Popup history preview | Late fallback to keyframe would disappear; usually no practical impact because other prompt fields precede it. |
| Benchmarks | No direct impact. |
| Prompt feedback | No direct impact unless the user manually selected/exported keyframe through JSON/Copy All. |

### Affected API Fields

Current public response includes:

```js
prompts.keyframe
```

Removing generation would require one of:

1. Keep the field but return `""`.
2. Remove the field from `backend/promptGenerator.js`.
3. Keep the field only for legacy compatibility but stop requiring it.

### Affected UI Elements

| UI location | Current keyframe behavior | Removal impact |
|---|---|---|
| Video platform accordion | Not shown. | No visible impact. |
| Image platform accordion | Shows Keyframe if `prompts.keyframe` exists. | Card disappears. |
| Copy All | Includes keyframe if present. | Copy All output changes. |
| JSON Export | Includes keyframe if present. | Export shape/content changes. |
| Popup history preview | Can use keyframe as late preview fallback. | Minimal fallback impact. |
| Popup history copy buttons | No keyframe button. | No impact. |

### Affected Validation Rules

Current video validation requires:

```js
keyframe
```

inside:

```js
requiredFields
```

If keyframe generation is removed, video validation must stop requiring it or every video generation result will fail with:

```text
keyframe: empty or too short
```

No image validation change would be needed for the active image path, because keyframe is not currently required for image validation.

## Conclusion

`keyframe` is currently required by backend video generation and validation, but only lightly consumed after that.

Strong dependencies:

- `generateVideoPromptsByPlatform()` aggregation
- video `validatePrompts()` required field
- API response shape

Weak/optional dependencies:

- Copy All
- JSON Export
- image-mode UI card if present
- popup history preview fallback

No dependency found:

- active image generation
- benchmarking
- prompt feedback analytics
- future generation workflows

No code was modified for this audit.
