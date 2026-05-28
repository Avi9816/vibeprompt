"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT_DIR = path.join(__dirname, "..", "reference_patterns");
const PLATFORMS = ["veo", "sora", "runway", "kling", "pika"];

const TERM_PATTERNS = {
  camera: /\b(camera|framing|frame|composition|push-in|locked-off|handheld|screen-recording|depth|focus|lens|shot|medium|close|wide)\b/gi,
  motion: /\b(motion|moves|movement|drift|push-in|turns|turn|gestures|gesture|walks|walk|flows|flow|shifts|shift|scroll|scrolling|cursor|flickers|flicker|swirls|swirl|drizzle|lifts|lift|rests|examines|adjusts|leans|holds|pauses|speaks|explains|demonstrates|applies|rotates|slides|opens|reveals|sets|points|boards|looks|updates|edits|types|reviews|browses|trims|filters|selects|changes|stands|raises|receives|ties|extends|throws|clips|rehearses)\b/gi,
  lighting: /\b(light|lighting|daylight|glow|lamp|sunlight|shadow|lit|overhead|window|shade|amber|cool|warm|bright|soft|practical|natural|diffused|directional|morning|afternoon|dawn|dark)\b/gi,
  audio: /\b(audio|sound|ambient|sfx|dialogue|voice|speech|music|hears|quiet)\b/gi,
  dialogue: /"[^"]+"|\b(dialogue|says|speaks|voice|speech)\b/gi,
  atmosphere: /\b(atmosphere|mood|cinematic|realism|serene|polished|grounded|calm|quiet|energy|emotional|tone)\b/gi,
  temporal: /\b(as the moment unfolds|continuity|temporal|sequence|progression|gradually|slowly|then|before|after|begins|starts|continues|across the shot)\b/gi,
};

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function sentenceCount(text) {
  const matches = String(text || "").match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : String(text || "").split(/[.!?]+/).filter(v => v.trim()).length;
}

function countTerms(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function structureFor(prompt) {
  const text = String(prompt || "").toLowerCase();
  const parts = [];
  if (/^slow|^static|^locked|^gentle|^medium|^close|^wide/.test(text)) parts.push("camera-first");
  if (/^[a-z][^.]+ in a /.test(text)) parts.push("subject-environment opening");
  if (/\bthe subject\b/.test(text)) parts.push("explicit subject action");
  if (/\bwhile\b/.test(text)) parts.push("simultaneous action");
  if (/\bas the moment unfolds\b|\bcontinuity\b|\btemporal\b/.test(text)) parts.push("temporal continuity");
  if (/\bambient sound\b|\baudio\b|\bdialogue\b/.test(text)) parts.push("audio guidance");
  if (/\bmood:|\bemotional tone\b|\bstyle is\b|\bvisual style\b/.test(text)) parts.push("style/mood ending");
  return parts.length ? parts.join(" -> ") : "direct visual instruction";
}

function topStructures(prompts) {
  const counts = new Map();
  for (const prompt of prompts) {
    const key = structureFor(prompt);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([structure, count]) => ({ structure, count }));
}

function analyzePlatform(platform) {
  const dir = path.join(ROOT, platform);
  const prompts = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (Array.isArray(data.examples)) prompts.push(...data.examples);
  }
  const total = Math.max(1, prompts.length);
  const metric = {
    avgWords: Math.round(prompts.reduce((sum, prompt) => sum + words(prompt).length, 0) / total),
    avgSentences: Math.round((prompts.reduce((sum, prompt) => sum + sentenceCount(prompt), 0) / total) * 10) / 10,
    cameraFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.camera), 0) / total) * 100) / 100,
    motionFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.motion), 0) / total) * 100) / 100,
    lightingFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.lighting), 0) / total) * 100) / 100,
    audioFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.audio), 0) / total) * 100) / 100,
    dialogueFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.dialogue), 0) / total) * 100) / 100,
    atmosphereFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.atmosphere), 0) / total) * 100) / 100,
    temporalFrequency: Math.round((prompts.reduce((sum, prompt) => sum + countTerms(prompt, TERM_PATTERNS.temporal), 0) / total) * 100) / 100,
    commonStructures: topStructures(prompts),
  };
  console.log("[reference pattern analysis]");
  console.log(JSON.stringify({ platform, ...metric }, null, 2));
  return metric;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const platform of PLATFORMS) {
    const metric = analyzePlatform(platform);
    fs.writeFileSync(path.join(OUT_DIR, `${platform}.json`), `${JSON.stringify(metric, null, 2)}\n`);
  }
}

main();
