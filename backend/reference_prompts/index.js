"use strict";

const fs = require("fs");
const path = require("path");

function safeSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function loadReferencePrompts(platform, category) {
  const safePlatform = safeSegment(platform);
  const safeCategory = safeSegment(category);
  const filePath = path.join(__dirname, safePlatform, `${safeCategory}.json`);
  let examples = [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    examples = Array.isArray(parsed.examples) ? parsed.examples : [];
  } catch {
    examples = [];
  }

  console.log("[reference prompts loaded]");
  console.log(JSON.stringify({
    platform: safePlatform,
    category: safeCategory,
    count: examples.length,
  }, null, 2));

  return { examples };
}

module.exports = {
  loadReferencePrompts,
};
