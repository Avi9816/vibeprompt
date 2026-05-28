const fs = require("fs");
const path = require("path");

const BENCHMARK_ROOT = __dirname;
const QUICK_BENCHMARK_FILE = path.join(BENCHMARK_ROOT, "quick_benchmarks.json");

const FAILURE_PATTERNS = [
  "weak motion recreation",
  "generic faces",
  "incorrect camera energy",
  "over-cinematic output",
  "weak social-media realism",
  "incorrect lighting",
  "poor vibe recreation",
  "static-feeling motion"
];

const SCORE_KEYS = [
  "subject_accuracy",
  "motion_accuracy",
  "camera_accuracy",
  "lighting_accuracy",
  "audio_vibe_accuracy",
  "social_media_realism",
  "overall_similarity"
];

const QUICK_FAILURE_GROUPS = {
  motionFailures: ["motion too static", "poor motion continuity", "inaccurate movement"],
  vibeFailures: ["wrong vibe", "weak reel energy", "inaccurate audio vibe"],
  cameraFailures: ["wrong camera", "too cinematic"],
  creatorFailures: ["generic face", "weak creator vibe"],
  realismFailures: ["lighting mismatch", "weak reel energy", "too cinematic"]
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function timestamp() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeCase(input) {
  const now = timestamp();
  const category = slugify(input.category || "uncategorized");
  const caseId = slugify(input.case_id || `${category}-${now}`);

  return {
    case_id: caseId,
    category,
    original_reel: input.original_reel || "",
    original_notes: input.original_notes || "",
    platform_tested: input.platform_tested || "veo",
    master_prompt: input.master_prompt || "",
    platform_prompt: input.platform_prompt || "",
    generated_video: input.generated_video || "",
    scores: {
      subject_accuracy: Number(input.scores?.subject_accuracy || 0),
      motion_accuracy: Number(input.scores?.motion_accuracy || 0),
      camera_accuracy: Number(input.scores?.camera_accuracy || 0),
      lighting_accuracy: Number(input.scores?.lighting_accuracy || 0),
      audio_vibe_accuracy: Number(input.scores?.audio_vibe_accuracy || 0),
      social_media_realism: Number(input.scores?.social_media_realism || 0),
      overall_similarity: Number(input.scores?.overall_similarity || 0)
    },
    issues: Array.isArray(input.issues) ? input.issues : [],
    strengths: Array.isArray(input.strengths) ? input.strengths : [],
    final_notes: input.final_notes || "",
    created_at: input.created_at || now,
    updated_at: now
  };
}

function saveBenchmarkCase(input) {
  const benchmarkCase = normalizeCase(input);
  const casesDir = path.join(BENCHMARK_ROOT, benchmarkCase.category, "cases");
  ensureDir(casesDir);

  const filePath = path.join(casesDir, `${benchmarkCase.case_id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(benchmarkCase, null, 2)}\n`);

  return {
    filePath,
    case: benchmarkCase
  };
}

function readQuickBenchmarks(filePath = QUICK_BENCHMARK_FILE) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeQuickBenchmark(input) {
  const rating = String(input.rating || "").trim().toLowerCase();
  const ratingScore = rating === "good" ? 3 : rating === "okay" ? 2 : 1;
  return {
    timestamp: input.timestamp || timestamp(),
    category: slugify(input.category || "uncategorized"),
    master_prompt: String(input.master_prompt || ""),
    veo_prompt: String(input.veo_prompt || input.platform_prompt || ""),
    reel_type: String(input.reel_type || "other"),
    creator_archetype: String(input.creator_archetype || ""),
    motion_energy: String(input.motion_energy || ""),
    rating: rating === "good" || rating === "okay" || rating === "bad" ? rating : "bad",
    rating_score: ratingScore,
    main_failure: String(input.main_failure || "other"),
    notes: String(input.notes || "").slice(0, 500)
  };
}

function saveQuickBenchmark(input, filePath = QUICK_BENCHMARK_FILE) {
  const entry = normalizeQuickBenchmark(input);
  const entries = readQuickBenchmarks(filePath);
  entries.push(entry);
  fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return entry;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listCaseFiles(root = BENCHMARK_ROOT) {
  const files = [];
  const categories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const category of categories) {
    const casesDir = path.join(root, category, "cases");
    if (!fs.existsSync(casesDir)) continue;

    for (const file of fs.readdirSync(casesDir)) {
      if (file.endsWith(".json")) files.push(path.join(casesDir, file));
    }
  }

  return files;
}

function average(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function countTerms(cases, field) {
  const counts = new Map();
  for (const item of cases) {
    for (const value of item[field] || []) {
      const key = String(value).trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function detectFailurePatterns(cases) {
  const text = cases
    .flatMap((item) => [...(item.issues || []), item.final_notes || ""])
    .join(" ")
    .toLowerCase();

  return FAILURE_PATTERNS
    .map((pattern) => ({
      pattern,
      count: text.split(pattern).length - 1
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function generateBenchmarkSummary(root = BENCHMARK_ROOT) {
  const cases = listCaseFiles(root).map(readJsonFile);
  const averageScores = {};

  for (const key of SCORE_KEYS) {
    averageScores[key] = average(cases.map((item) => Number(item.scores?.[key] || 0)));
  }

  const categoryScores = new Map();
  for (const item of cases) {
    const bucket = categoryScores.get(item.category) || [];
    bucket.push(Number(item.scores?.overall_similarity || 0));
    categoryScores.set(item.category, bucket);
  }

  const rankedCategories = [...categoryScores.entries()]
    .map(([category, values]) => ({ category, average: average(values), count: values.length }))
    .sort((a, b) => b.average - a.average);

  return {
    total_cases: cases.length,
    average_scores: averageScores,
    best_categories: rankedCategories.slice(0, 3),
    weakest_categories: rankedCategories.slice(-3).reverse(),
    common_failures: detectFailurePatterns(cases),
    common_strengths: countTerms(cases, "strengths")
  };
}

function rankedCategories(entries, direction = "desc") {
  const buckets = new Map();
  for (const entry of entries) {
    const values = buckets.get(entry.category) || [];
    values.push(Number(entry.rating_score || 0));
    buckets.set(entry.category, values);
  }
  return [...buckets.entries()]
    .map(([category, values]) => ({ category, average: average(values), count: values.length }))
    .sort((a, b) => direction === "asc" ? a.average - b.average : b.average - a.average);
}

function countQuickFailures(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = String(entry.main_failure || "other").trim() || "other";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([failure, count]) => ({ failure, count }));
}

function failurePriority(entries) {
  const text = entries.map((entry) => entry.main_failure || "").join(" ").toLowerCase();
  return Object.fromEntries(
    Object.entries(QUICK_FAILURE_GROUPS).map(([group, terms]) => [
      group,
      terms.reduce((sum, term) => sum + (text.split(term).length - 1), 0)
    ])
  );
}

function generateQuickBenchmarkSummary(filePath = QUICK_BENCHMARK_FILE) {
  const entries = readQuickBenchmarks(filePath);
  return {
    totalTests: entries.length,
    goodCount: entries.filter((entry) => entry.rating === "good").length,
    okayCount: entries.filter((entry) => entry.rating === "okay").length,
    badCount: entries.filter((entry) => entry.rating === "bad").length,
    commonFailures: countQuickFailures(entries),
    strongestCategories: rankedCategories(entries, "desc").slice(0, 3),
    weakestCategories: rankedCategories(entries, "asc").slice(0, 3),
    failurePriority: failurePriority(entries)
  };
}

if (require.main === module) {
  const summary = generateBenchmarkSummary();
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  FAILURE_PATTERNS,
  saveBenchmarkCase,
  generateBenchmarkSummary,
  saveQuickBenchmark,
  generateQuickBenchmarkSummary
};
