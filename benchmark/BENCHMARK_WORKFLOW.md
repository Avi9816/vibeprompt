# Benchmark Workflow

This workflow evaluates semantic video reconstruction quality, with Veo as the primary benchmark platform for Phase 1.

## Steps

1. Save original reel reference.
   - Use a private URL, internal identifier, or rights-cleared media reference.
   - Do not commit copyrighted videos or private creator content.

2. Run extension analysis.
   - Analyze the reel through the browser extension.
   - Confirm the backend returns extracted JSON and generated prompts.

3. Save extracted JSON.
   - Store factual extraction and semantic intelligence in the case notes or a companion JSON file.
   - Keep private source material out of the repository.

4. Save master prompt.
   - Copy the generated master prompt into the benchmark case.

5. Save Veo prompt.
   - Copy the Veo platform prompt into `platform_prompt`.

6. Generate Veo video.
   - Paste the Veo prompt into Veo.
   - Save the generated result reference if it is safe to publish.

7. Save generated video reference.
   - Use a local private path, private URL, or a rights-cleared asset reference.
   - Do not commit generated media files unless they are intended for publication.

8. Compare original vs generated.
   - Evaluate subject, action, camera, lighting, audio vibe, social-media realism, and overall similarity.

9. Score categories.
   - Use 0-10 scores for each dimension.
   - Prefer consistent scoring across categories over perfect precision.

10. Record weaknesses and strengths.
    - Add concise issue tags and strengths.
    - Use the same issue names repeatedly so regression tracking can detect patterns.

## Recommended Case Location

```text
benchmark/{category}/cases/{case_id}.json
```

Generated result notes can go in:

```text
benchmark/{category}/results/
benchmark/{category}/notes/
```
