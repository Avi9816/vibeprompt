# Keyframe Optional Report

## Summary

This experiment makes keyframe generation optional for video prompt generation without removing any keyframe code.

The five primary video platforms remain blocking:

- `veo`
- `runway`
- `sora`
- `kling`
- `pika`

`keyframe` is still attempted. If it succeeds, `prompts.keyframe` is populated. If it fails, video generation continues and returns:

```json
{
  "prompts": {
    "keyframe": ""
  }
}
```

## Files Modified

| File | Change |
|---|---|
| `backend/analyzer.js` | Decoupled `keyframe` from the critical video generation failure path. |
| `backend/analyzer.js` | Removed `keyframe` from video required-field validation. |
| `backend/analyzer.js` | Removed `keyframe` from video expected-platform diagnostics. |
| `backend/analyzer.js` | Added `[keyframe optional mode]` diagnostics. |

No UI files were modified.

No keyframe generation code was removed.

`KEYFRAME_SYSTEM` remains unchanged.

## Aggregation Changes

Before:

```js
const failed=results.find(r=>!r.ok);
if(failed) throw failed.error;
const [runway,sora,kling,veo,pika,keyframe]=results.map(r=>r.value);
```

Any failure, including keyframe, failed the entire video generation attempt.

After:

```js
const platformResults=results.slice(0,5);
const keyframeResult=results[5];
const failed=platformResults.find(r=>!r.ok);
if(failed) throw failed.error;
const [runway,sora,kling,veo,pika]=platformResults.map(r=>r.value);
const keyframe=keyframeResult?.ok ? keyframeResult.value : "";
```

Only the five primary video platforms are blocking.

## Validation Changes

Video validation still requires:

```json
[
  "runway",
  "sora",
  "pika",
  "kling",
  "veo",
  "negative",
  "camera_spec",
  "style_tags"
]
```

Video validation no longer requires:

```json
[
  "keyframe"
]
```

This means a failed keyframe no longer causes:

```text
keyframe: empty or too short
```

Image validation is unchanged.

## Diagnostics

Added:

```text
[keyframe optional mode]
```

Shape:

```json
{
  "generated": true,
  "failed": false,
  "reason": "",
  "videoGenerationSucceeded": true
}
```

Failure shape:

```json
{
  "generated": false,
  "failed": true,
  "reason": "Keyframe invalid JSON. Preview: ...",
  "videoGenerationSucceeded": true
}
```

When keyframe fails, the existing pipeline debugger also receives:

```text
Keyframe: Optional keyframe generation failed
```

## Compatibility Impact

### API Response

Preserved.

`backend/promptGenerator.js` already returns:

```js
keyframe: p?.keyframe || ""
```

So the response shape remains compatible.

### JSON Export

Preserved.

The frontend JSON export downloads the full response object. If keyframe fails, JSON export includes:

```json
"keyframe": ""
```

### Copy All

Preserved.

Copy All iterates `data.prompts`. If `keyframe` is empty, it will not contribute useful prompt text. Existing behavior remains compatible.

### History Compatibility

Preserved.

Popup history only uses keyframe as a late fallback preview field. Existing history entries with keyframe still work, and new entries without keyframe fall back to other prompts first.

### UI References

Preserved.

No UI references were removed. The image-mode `Keyframe` card still exists if `prompts.keyframe` is present.

## Expected Runtime Behavior

### Keyframe succeeds

```json
{
  "generated": true,
  "failed": false,
  "reason": "",
  "videoGenerationSucceeded": true
}
```

Video response includes a populated:

```json
"keyframe": "..."
```

### Keyframe fails, platforms succeed

```json
{
  "generated": false,
  "failed": true,
  "reason": "Keyframe invalid JSON...",
  "videoGenerationSucceeded": true
}
```

Video response still succeeds and includes:

```json
"keyframe": ""
```

### Any primary video platform fails

Video generation still fails/retries as before.

Blocking platforms remain:

```json
["runway", "sora", "kling", "veo", "pika"]
```

## Experiment Boundary

This does not:

- remove `generateKeyframePrompt()`
- remove `KEYFRAME_SYSTEM`
- remove keyframe from API responses
- remove UI references
- change the five primary video prompts
- change image generation
- change benchmarking

This only removes keyframe from the critical video generation path.

## Verification

Passed:

```text
node --check backend\analyzer.js
```
