# VibePrompt

Semantic video reconstruction engine for generating platform-native prompts from social-media reels.

VibePrompt analyzes social-media visuals, motion, audio, OCR overlays, creator context, and reel structure, then turns that understanding into copy-ready prompts for modern video generation platforms.

## Features

- Semantic extraction from social-media images and reels
- Creator archetype intelligence for social-native prompt tone
- Motion energy intelligence for dance, sports, fitness, food, and product reels
- Temporal progression modeling for evolving reel moments
- Attention direction intelligence for focal hierarchy and visual emphasis
- Audio intelligence for speech, music, language, and dialogue guidance
- Cinematic refinement and visual language translation
- Platform-native prompt generation for Veo, Sora, Runway, Kling, and Pika
- Feedback-aware optimization using stored prompt ratings
- Prompt guardrails to preserve natural cinematic language and factual grounding

## Pipeline Overview

```text
Video
-> Extraction
-> Semantic Intelligence
-> Reel Energy Intelligence
-> Creator Archetype Intelligence
-> Temporal Progression
-> Attention Direction
-> Visual Translation
-> Prompt Optimization
-> Final Prompt Generation
```

## Supported Platforms

- Veo
- Sora
- Runway
- Kling
- Pika

## Development Status

This is an experimental, research-stage semantic reconstruction system. It is designed for prompt engineering research, benchmark-driven iteration, and social-video recreation workflows.

The system performs semantic recreation, not exact motion cloning.

## Setup

Install backend dependencies:

```bash
cd backend
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Configure provider keys and local model paths in `backend/.env`. Do not commit `.env` files or local model assets.

Start the backend:

```bash
cd backend
npm start
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the `extension/` directory.
5. Open Instagram and run analysis from the injected result panel.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full pipeline, prompt stages, feedback system, and platform profile layout.

## Benchmarking

Benchmarks live in `benchmark/` and are organized by content category. Each benchmark case should track:

- original reel reference or local private note
- extracted JSON
- generated master prompt
- generated platform prompt
- generated video result
- rating notes and issue tags

Do not commit copyrighted videos, generated media, private user content, or provider outputs unless you have the right to publish them.

## Notes

VibePrompt is intended to reconstruct the semantic intent of a reel: subject, action, creator energy, motion style, attention flow, audio role, and platform-native prompt structure. It does not attempt exact identity cloning, exact choreography extraction, or exact frame-by-frame reproduction.
