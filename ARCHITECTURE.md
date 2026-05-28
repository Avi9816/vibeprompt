# Architecture

VibePrompt is a semantic social-video reconstruction engine. It converts a reel or image into grounded facts, enriches those facts with creator and motion intelligence, then assembles platform-native prompts for video generation systems.

## Core Pipeline

### Stage 1: Extraction

Stage 1 focuses on factual grounded analysis.

- OCR extraction for readable overlay text and topic summaries
- Speech extraction and transcription for supported video inputs
- Semantic extraction for content type, reel type, scene purpose, activity context, and audience intent
- Motion extraction from visual evidence, including subject motion, camera motion, and environmental motion
- Object extraction for primary objects, product identity, hero elements, and food focus
- Screen intelligence for UI screenshots and screen recordings

Stage 1 should remain factual. It should not create cinematic phrasing or invent unsupported visual details.

### Stage 2: Intelligence

Stage 2 turns grounded facts into reusable prompt intelligence.

- Creator archetype intelligence
- Reel energy intelligence
- Motion energy intelligence
- Temporal progression intelligence
- Attention direction intelligence
- Audio intelligence
- Workflow and screen-domain context when relevant

These layers describe what the generated video should emphasize, but internal semantic labels should be translated before reaching final user-facing prompts.

### Stage 3: Prompt Generation

Stage 3 converts intelligence into platform-ready prompt text.

- Cinematic refinement
- Generative visual language translation
- Platform prompt assembly
- Feedback-aware optimization
- Prompt guardrails

Final prompts should read like generation direction, not internal analysis.

## Platform Profiles

Platform behavior is configured through:

```text
backend/prompt_profiles/
```

Profiles define preferred structure, emphasis scores, writing style, recommended elements, avoid rules, and target length. Platform-specific behavior should be profile-driven where possible.

## Reference Patterns

Reference prompt examples and derived pattern summaries live in:

```text
backend/reference_prompts/
backend/reference_patterns/
```

These files guide style, rhythm, length, and terminology without copying examples directly.

## Feedback System

Prompt feedback is written locally to:

```text
backend/prompt_feedback/
```

Optimization summaries are written locally to:

```text
backend/prompt_optimization/
```

Both directories contain generated local data and are ignored by Git. They are intended for iterative local tuning and should not be published with private prompt or user data.

## Prompt Pipeline

```text
draft_prompt
-> refined_prompt
-> optimized_prompt
-> translated_prompt
-> guarded_final_prompt
```

Guardrails must run after optimization so poor automatic rewrites can be rolled back before prompts are returned to users.

## Goals

The system aims to recreate the semantic structure of social-media video:

- what the viewer should see first
- what action or performance is unfolding
- how attention moves through the shot
- how camera, lighting, and environment support the reel
- how platform-native prompt language should differ between Veo, Sora, Runway, Kling, and Pika

The goal is semantic social-video reconstruction, not exact frame cloning or exact choreography reproduction.
