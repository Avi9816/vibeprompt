# Prompt Pipeline Runtime Results

Date: 2026-05-29

## Status

No real Instagram runtime samples were executed in this workspace.

The requested sample set was:

- talking-head reel
- cinematic reel
- product reel
- image post
- carousel post

I found no local real Instagram media captures or saved analysis payloads for those categories. The workspace contains only mock benchmark JSON cases:

- `benchmark/beauty/cases/beauty_mock_001.json`
- `benchmark/food/cases/food_mock_001.json`
- `benchmark/talking_head/cases/talking_head_mock_001.json`

Those mock cases were not used because this task specifically requires real Instagram runtime samples and full diagnostic output from the new instrumentation.

## Why Results Were Not Collected

The new instrumentation logs only during actual backend analysis execution. A valid runtime sample requires at least one of:

- captured `imageFrames` from the extension
- captured `imageBase64`
- real Instagram image/video media available to the backend

None of those real captured sample payloads are present in the repository.

The backend has environment variables configured for model access, but without real captured Instagram payloads, running the analyzer would require synthetic images or mock benchmark entries. That would not answer the requested evidence question.

## Request-To-Prompt Call Chain Confirmed

The prompt-generation path is:

1. `extension/content.js`
   - `handleClick()`
   - frame/audio capture
   - `POST /analyze-image`

2. `backend/server.js`
   - `/analyze-image`
   - `normalizeAnalyzeImagePayload()`
   - `analyzeImageFramesBase64()` or `analyzeImageBase64()`

3. `backend/analyzer.js`
   - `runAnalysis()`
   - `buildStage1Prompt()`
   - Stage 1 factual extraction
   - semantic/audio/motion/object enrichment
   - `generateVideoPromptsWithRetry()` or `generateImagePromptsWithRetry()`
   - `generateVideoPromptsByPlatform()`
   - `buildPlatformPrompt()`
   - `compressStage2Assembly()`
   - `generatePlatformField()`
   - final platform prompts

## Sample Results

### 1. Talking-Head Reel

Status: not run

Reason: no real talking-head reel capture or payload available.

Prompt pipeline report: not available

Payload growth report: not available

Semantic overlap report: not available

Slot-only diagnostics: not available

### 2. Cinematic Reel

Status: not run

Reason: no real cinematic reel capture or payload available.

Prompt pipeline report: not available

Payload growth report: not available

Semantic overlap report: not available

Slot-only diagnostics: not available

### 3. Product Reel

Status: not run

Reason: no real product reel capture or payload available.

Prompt pipeline report: not available

Payload growth report: not available

Semantic overlap report: not available

Slot-only diagnostics: not available

### 4. Image Post

Status: not run

Reason: no real image-post capture or payload available.

Prompt pipeline report: not available

Payload growth report: not available

Semantic overlap report: not available

Slot-only diagnostics: not available

### 5. Carousel Post

Status: not run

Reason: no real carousel-post capture or payload available.

Prompt pipeline report: not available

Payload growth report: not available

Semantic overlap report: not available

Slot-only diagnostics: not available

## Aggregate Summary

Because zero real samples were executed, the requested averages cannot be computed yet.

| Metric | Value |
|---|---:|
| average Stage1Facts size | not available |
| average DirectorBrief size | not available |
| average DirectorPrompt size | not available |
| average ShotPlan size | not available |
| average PromptSlots size | not available |
| average PromptComponents size | not available |
| average compressed size | not available |
| average final prompt size | not available |

## Largest Payload Contributors

Not available. Requires at least one real runtime `[payload growth report]`.

## Stages Adding Less Than 5% Unique Information

Not available. Requires runtime overlap and output-size data.

## Highest Semantic Overlap

Not available. Requires runtime `[semantic overlap report]` entries.

## Potentially Redundant Stages

Not available. No redundancy conclusion should be drawn without real runtime evidence.

## Evidence Collection Protocol

To complete this report, run the extension against five real Instagram samples:

1. Open the backend terminal.
2. Start the backend normally.
3. Open Instagram with the extension loaded.
4. Analyze one sample per category:
   - talking-head reel
   - cinematic reel
   - product reel
   - image post
   - carousel post
5. For each request, copy the backend logs containing:
   - `[prompt trace]`
   - `[prompt pipeline report]`
   - `[payload growth report]`
   - `[semantic overlap report]`
   - `[slot-only diagnostics]`
6. Paste the logs into this file under the matching sample section.
7. Compute the aggregate summary from the logged `stageBreakdown` values.

## Integrity Note

No mock samples, synthetic images, or fabricated prompt diagnostics were used. This file intentionally records the evidence gap so the next step can collect valid runtime data instead of optimizing from non-representative measurements.
