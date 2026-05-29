# JSON Prompt UI Audit

## Summary

The JSON prompt UI has not been removed from the extension. It is currently rendered as a collapsed advanced export control inside the result overlay:

```text
Advanced Debug Info
  JSON Export
    Download JSON
```

It is no longer visible as a top-level prompt tab or primary prompt view because the UI redesign moved JSON export into the collapsed debug/advanced section.

## Current Component

| Item | Current value |
|---|---|
| Component/function | `buildOverlay(data)` |
| Source file | `extension/content.js` |
| Current render location | Inside `Advanced Debug Info` |
| Current control label | `JSON Export` / `Download JSON` |
| Button id | `vpDl` |
| Event handler | `document.getElementById("vpDl")?.addEventListener("click", ...)` |
| Data source | The full `data` object passed into `showOverlay(data)` |
| Output behavior | Downloads `JSON.stringify(data, null, 2)` as `vibeprompt-{timestamp}.json` |

## Render Condition

Source: `extension/content.js`

The JSON export block is rendered unconditionally whenever `buildOverlay(data)` renders a successful analysis result:

```html
<details class="vp-inner-details">
  <summary class="vp-inner-summary">JSON Export</summary>
  <button class="vp-json-btn" id="vpDl">Download JSON</button>
</details>
```

However, it is nested inside:

```html
<details class="vp-details">
  <summary class="vp-summary">Advanced Debug Info ...</summary>
  ...
</details>
```

Both `<details>` elements are collapsed by default, so users must expand:

1. `Advanced Debug Info`
2. `JSON Export`

before seeing the download button.

## Data Source

The JSON export does not depend on a special JSON prompt object. It downloads the same overlay response object used by the UI:

```js
const blob = new Blob([JSON.stringify(data, null, 2)], {
  type: "application/json"
});
```

The `data` object comes from:

```js
const data = await res.json();
saveHistory(data, "instagram-media");
showOverlay(data);
```

Backend source:

```text
POST /analyze-image
  -> analyzer raw result
  -> generatePrompts(raw, resolvedType)
  -> res.json(result)
```

## Backend Response Status

The backend still returns the required data for JSON export.

Current response shape from `backend/promptGenerator.js`:

```js
{
  scene,
  prompts: {
    primary,
    runway,
    sora,
    pika,
    kling,
    veo,
    flux,
    midjourney,
    keyframe
  },
  negative,
  cameraSpec,
  motionScore,
  sceneProgression,
  cameraMotion,
  environmentalMotion,
  styleTags,
  stylePreset,
  mediaType,
  factual,
  debug,
  model,
  analysisMode,
  generatedAt
}
```

This is sufficient for the JSON export button because the button downloads whatever `data` object the overlay received.

## Dependency Check

| System | Required for JSON export? | Notes |
|---|---:|---|
| `PromptComponents` | No | `buildPromptComponents()` output is not directly returned by `backend/promptGenerator.js`. |
| `ProfileAssembly` | No | `profileAssembly` is an internal Stage 2 assembly artifact and is not needed by the UI export button. |
| `PlatformWriterOutput` | No | Internal prompt-generation artifact; not required for JSON download. |
| Legacy Stage 2 structures | No | JSON export downloads the final overlay `data`, not legacy Stage 2 prompt internals. |
| `data.prompts` | Yes | Used by UI and included in downloaded JSON. |
| `data.factual` | Yes | Included in downloaded JSON and shown in debug metadata. |
| `data.debug` | Yes | Included in downloaded JSON and shown in debug steps. |

## Historical UI Location

From the initial implementation (`6d1b0c4`), the JSON export was already rendered as an advanced section:

```text
Advanced: JSON Export
  Download JSON
```

At that point it was a direct advanced section in the overlay, not nested under a broader debug container.

## When It Stopped Appearing Prominently

The visibility changed during commit:

```text
b3cbe42 Creator-performance rewrite and UX redesign
```

That commit redesigned the result hierarchy and moved advanced/debug-oriented content under:

```text
Advanced Debug Info
```

The JSON export became nested inside that collapsed section. This made it feel like the JSON prompt UI disappeared, even though the button still exists.

## Current Status

| Audit item | Status |
|---|---|
| JSON export rendered? | Yes |
| Top-level JSON prompt tab rendered? | No |
| Visible by default? | No |
| Requires successful overlay render? | Yes |
| Requires `data.prompts`? | No for download, yes for useful exported prompt content |
| Requires `PromptComponents`? | No |
| Requires `ProfileAssembly`? | No |
| Requires `PlatformWriterOutput`? | No |
| Backend still returns downloadable data? | Yes |

## Reason It Is No Longer Visible

The JSON prompt UI is no longer visible by default because of UX hierarchy changes, not because backend data is missing.

Current nesting:

```text
Result Overlay
  Generation Style
  Master Prompt
  Generated Prompts
  Benchmark Tools
  Advanced Debug Info
    Video Direction Metadata
    JSON Export
      Download JSON
```

The JSON export is hidden behind collapsed advanced/debug sections to reduce the primary UI clutter.

## Notes

- The current backend does not expose `master_prompt` through `backend/promptGenerator.js`, even though `backend/analyzer.js` creates it. The UI compensates by falling back to `veo`, `sora`, `runway`, `kling`, `pika`, then `primary`.
- This affects the semantic usefulness of exported prompt JSON, but it does not prevent the JSON export control from rendering.
- The JSON export button downloads the frontend result object, not the raw analyzer object. Therefore internal prompt orchestration artifacts such as `prompt_components`, `profile_assembly`, and `platform_writer` are not expected to appear unless explicitly included in the returned response.
