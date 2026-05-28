# Improvement Loop

The benchmark suite is designed to turn qualitative prompt failures into repeatable development feedback.

```text
benchmark
-> identify failures
-> refine prompts
-> retest
-> compare scores
-> track improvements
```

## 1. Benchmark

Run a representative case through the extension and generate a Veo result.

## 2. Identify Failures

Use the comparison guide and case scores to identify repeatable problems:

- weak motion recreation
- generic faces
- incorrect camera energy
- over-cinematic output
- weak social-media realism
- incorrect lighting
- poor vibe recreation
- static-feeling motion

## 3. Refine Prompts

Modify only the relevant prompt layer. Avoid changing factual extraction unless the failure is clearly caused by bad extraction.

## 4. Retest

Run the same case again and save a new result or updated case notes.

## 5. Compare Scores

Compare score movement across the same dimensions:

- subject accuracy
- motion accuracy
- camera accuracy
- lighting accuracy
- audio/vibe accuracy
- social-media realism
- overall similarity

## 6. Track Improvements

Regression tracking is strongest when case IDs remain stable and issue tags stay consistent.
