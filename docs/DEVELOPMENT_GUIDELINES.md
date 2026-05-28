# Development Guidelines

This project depends on a grounded multi-stage prompt pipeline. Most regressions come from weakening factual constraints or letting internal semantic labels leak into final prompts.

## Safety Rules

- Avoid breaking prompt assembly.
- Preserve factual grounding across every stage.
- Avoid hallucinated motion, clothing, objects, lighting, locations, dialogue, and camera movement.
- Maintain platform-specific behavior for Veo, Sora, Runway, Kling, and Pika.
- Test changes against the benchmark suite before treating them as stable.
- Guardrails must run after optimization.
- Semantic intelligence should not leak directly into final prompts.
- The visual translation layer should remain generation-oriented.

## Prompt Pipeline Discipline

- Stage 1 should extract facts only.
- Intelligence layers may interpret grounded facts, but should track uncertainty and confidence.
- Stage 2 prompt writing should use director-ready visual language.
- Final prompts should sound natural, cinematic, and platform-native.

## Benchmark Discipline

- Add benchmark cases by category under `benchmark/`.
- Do not commit copyrighted videos, private reels, generated media, or provider outputs unless publication rights are clear.
- Store extracted JSON, prompts, issue tags, and rating notes rather than raw copyrighted assets.

## Review Checklist

- Did the change preserve API response shape?
- Did it avoid core extraction changes unless explicitly required?
- Did it preserve strict parsing and retry behavior?
- Did it avoid adding new dependencies unnecessarily?
- Did it keep prompt optimization from inventing new facts?
- Did it pass relevant syntax checks and benchmark spot checks?
