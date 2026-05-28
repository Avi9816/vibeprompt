"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PROFILE_DIR = path.join(__dirname, "..", "prompt_profiles");
const PLATFORMS = ["veo", "sora", "runway", "kling", "pika"];
const CATEGORIES = [
  "portrait",
  "talking_head",
  "beauty",
  "fashion",
  "fitness",
  "product_showcase",
  "product_unboxing",
  "food",
  "travel",
  "screen_recording",
];

const SCENES = {
  portrait: [
    ["ceramic artist", "rests beside a wheel-thrown vase", "quiet pottery studio", "soft window light", "dust motes drift near the worktable"],
    ["older violin maker", "examines a polished instrument neck", "wood-lined workshop", "warm bench lamp", "hands turn the piece with care"],
    ["young photographer", "adjusts a camera strap across one shoulder", "rooftop at blue hour", "cool skyline glow", "jacket fabric shifts in the breeze"],
    ["gardener", "holds a cluster of fresh herbs", "greenhouse aisle", "diffused morning light", "leaves tremble lightly"],
    ["chef in a linen apron", "leans against a prep counter", "quiet restaurant kitchen", "overhead practical light", "steam moves faintly behind them"],
    ["student painter", "stands near a large canvas", "sunlit art classroom", "high side light", "paintbrush hand settles naturally"],
    ["bookshop owner", "pauses between narrow shelves", "independent bookstore", "amber reading lamp", "soft page movement in the background"],
    ["cyclist", "rests one hand on a helmet", "urban underpass", "hard afternoon light", "subtle posture shift"],
    ["florist", "holds a wrapped bouquet close to the chest", "flower market stall", "open shade", "loose petals move slightly"],
    ["architect", "looks over rolled drawings", "minimal concrete office", "clean daylight", "paper edges lift with a small draft"],
  ],
  talking_head: [
    ["nutrition educator", "explains a simple breakfast habit", "bright kitchen corner", "soft frontal window light", "small hand gestures emphasize key points"],
    ["software coach", "speaks directly to camera about workflow planning", "desk setup with monitor glow", "balanced practical lighting", "subtle head nods keep the delivery natural"],
    ["fitness instructor", "introduces a mobility routine", "calm studio space", "even overhead light", "hands demonstrate the movement range"],
    ["financial educator", "breaks down a savings concept", "home office", "warm desk lamp", "pen gestures mark each idea"],
    ["language tutor", "teaches pronunciation clearly", "simple classroom wall", "soft daylight", "mouth movement and finger counting remain visible"],
    ["doctor", "explains a wellness reminder", "clinic hallway", "clean soft lighting", "measured hand gestures support the explanation"],
    ["travel planner", "shares packing advice", "bedroom with suitcase", "morning light", "hands point toward folded items"],
    ["makeup educator", "describes brush placement", "vanity mirror setup", "gentle face light", "brush moves near the cheek"],
    ["career mentor", "presents an interview tip", "neutral office background", "soft key light", "upright posture and steady eye contact"],
    ["teacher", "explains a study technique", "whiteboard corner", "overhead classroom light", "marker hand moves between notes"],
  ],
  beauty: [
    ["model with natural makeup", "turns slightly to reveal skin texture", "clean vanity setup", "soft frontal light", "hair settles around the shoulders"],
    ["makeup artist", "applies blush with a small brush", "mirror-lit dressing table", "gentle cosmetic lighting", "brush movement stays precise"],
    ["skincare creator", "presses serum into the cheek", "bathroom counter", "cool diffused light", "fingertips move slowly across the skin"],
    ["hairstylist", "smooths a loose wave", "salon chair", "warm overhead light", "hair catches a subtle highlight"],
    ["beauty model", "lowers gaze toward the mirror", "minimal studio backdrop", "softbox-style light", "lashes and expression shift delicately"],
    ["nail artist", "turns a finished manicure toward camera", "tabletop work station", "focused task light", "hands rotate slowly"],
    ["spa therapist", "places a towel near the face", "serene treatment room", "muted warm light", "fabric folds settle gently"],
    ["creator applying lip balm", "tilts chin toward the mirror", "small bathroom shelf", "clean daylight", "hand motion remains slow and controlled"],
    ["esthetician", "demonstrates facial massage strokes", "neutral treatment studio", "soft even light", "hands glide in symmetrical motion"],
    ["model with glossy hair", "turns from profile to three-quarter view", "simple gray backdrop", "rim light on hair", "strands move lightly"],
  ],
  fashion: [
    ["model in a tailored coat", "steps once and settles into a pose", "stone arcade walkway", "late afternoon side light", "coat hem moves with the step"],
    ["stylist", "adjusts the cuff of an oversized blazer", "minimal fitting room", "soft mirror light", "fabric folds shift under the fingers"],
    ["runner in streetwear", "leans against a city railing", "empty parking deck", "cool morning light", "jacket fabric moves slightly"],
    ["designer", "holds a draped satin dress form", "fashion studio", "large window light", "fabric glides over the mannequin"],
    ["model in monochrome layers", "turns slowly in place", "industrial studio", "hard side light", "shadow follows the garment shape"],
    ["shoe designer", "presents a handmade leather boot", "workbench with tools", "warm lamp light", "boot rotates toward the lens"],
    ["vintage seller", "lifts a patterned jacket from a rack", "curated clothing shop", "ambient boutique light", "hanger sways gently"],
    ["model wearing flowing linen", "walks across a sunlit wall", "coastal terrace", "bright reflected light", "linen moves with the breeze"],
    ["tailor", "pins fabric on a dress form", "atelier table", "soft overhead light", "hands move carefully along the seam"],
    ["fashion creator", "reveals a layered outfit", "bedroom mirror area", "warm practical light", "subtle body turn shows silhouette"],
  ],
  fitness: [
    ["trainer", "demonstrates a controlled squat", "clean gym floor", "bright overhead light", "knees and hips move steadily"],
    ["yoga instructor", "flows from tabletop into a low lunge", "sunlit studio", "soft morning light", "breath-led motion stays calm"],
    ["runner", "ties a shoe before standing", "track lane", "early daylight", "hands pull the laces tight"],
    ["pilates coach", "extends one leg from a mat position", "minimal workout room", "even diffused light", "core movement remains slow"],
    ["boxer", "throws a light shadowboxing combination", "training gym", "hard side light", "gloves snap through the air"],
    ["cyclist", "clips into a stationary bike", "indoor cycling room", "low colored light", "pedal movement starts gradually"],
    ["mobility coach", "rotates shoulders with a resistance band", "home workout corner", "soft daylight", "band tension increases visibly"],
    ["dancer", "rehearses a controlled balance", "studio mirror wall", "overhead rehearsal light", "arms open slowly"],
    ["weightlifter", "sets up for a deadlift", "rubber gym platform", "high contrast light", "hands grip the bar"],
    ["hiker", "adjusts backpack straps", "trail overlook", "clear natural light", "fabric straps tighten across the shoulders"],
  ],
  product_showcase: [
    ["ceramic coffee mug", "rotates slightly on a tabletop", "minimal kitchen counter", "soft window light", "glaze highlights move across the rim"],
    ["wireless headphones", "sit open beside their case", "clean desk surface", "cool monitor light", "focus shifts toward the ear cushions"],
    ["glass water bottle", "stands beside condensation droplets", "outdoor picnic table", "bright natural light", "tiny reflections move across the glass"],
    ["linen notebook", "opens to blank pages", "wooden desk", "warm lamp light", "page edges lift subtly"],
    ["scented candle", "burns beside its box", "bathroom shelf", "low amber light", "flame flickers gently"],
    ["ceramic skincare jar", "rests on a stone tray", "vanity counter", "soft diffused light", "highlight rolls across the lid"],
    ["running shoe", "leans against a textured wall", "studio floor", "directional side light", "focus travels from sole to upper"],
    ["travel backpack", "stands upright with pockets visible", "hotel room corner", "morning light", "zipper pulls catch small highlights"],
    ["wooden speaker", "sits beside a plant", "living room console", "warm practical light", "surface texture becomes the focal detail"],
    ["kitchen blender", "rests near fresh fruit", "clean countertop", "bright overhead light", "attention shifts from blade housing to controls"],
  ],
  product_unboxing: [
    ["hands opening a plain shipping box", "lift tissue paper to reveal a skincare bottle", "clean tabletop", "soft indoor light", "paper folds settle around the product"],
    ["creator unpacking a small tech accessory", "removes the item from molded packaging", "desk surface", "cool monitor glow", "box lid slides aside"],
    ["hands opening a food gift box", "reveal wrapped jars and a note card", "kitchen counter", "warm overhead light", "crinkle paper shifts softly"],
    ["creator unboxing a pair of shoes", "pulls one shoe from the box", "bedroom floor", "window light", "tissue paper falls back"],
    ["hands opening a candle package", "lift the glass jar toward camera", "bathroom shelf", "low amber light", "wax surface catches highlights"],
    ["creator unpacking a travel pouch", "arranges each item beside the box", "hotel desk", "soft morning light", "small objects settle into a neat row"],
    ["hands opening a stationery kit", "slide out cards and pens", "wooden table", "warm desk lamp", "paper edges move gently"],
    ["creator revealing a fitness accessory", "pulls fabric straps from the package", "gym bench", "bright overhead light", "elastic material unfolds"],
    ["hands opening a tea sampler", "spread sachets around the tin", "kitchen table", "soft window light", "foil packets catch small reflections"],
    ["creator unboxing a ceramic item", "unwraps protective paper around the object", "studio table", "diffused side light", "paper rustles around the shape"],
  ],
  food: [
    ["toast with glossy nut spread", "receives a slow spoon swirl", "kitchen counter", "warm morning light", "spread texture thickens visibly"],
    ["steaming bowl of noodles", "is lifted with chopsticks", "small restaurant table", "overhead practical light", "steam curls upward"],
    ["fresh salad", "is tossed with dressing", "wooden prep surface", "bright window light", "greens tumble lightly"],
    ["pancake stack", "receives a drizzle of syrup", "breakfast table", "soft daylight", "syrup trails down the side"],
    ["iced coffee", "swirls as milk is poured", "cafe counter", "cool side light", "liquid clouds expand slowly"],
    ["sourdough loaf", "is sliced on a board", "bakery table", "warm oven light", "crumbs scatter near the knife"],
    ["fruit tart", "is rotated toward camera", "pastry display", "clean display light", "glaze catches small highlights"],
    ["rice bowl", "is topped with herbs", "home kitchen island", "soft overhead light", "herbs fall across the surface"],
    ["grilled sandwich", "is pulled apart", "paper-lined tray", "warm directional light", "melted cheese stretches briefly"],
    ["smoothie glass", "is set beside fresh fruit", "bright countertop", "morning window light", "condensation beads shimmer"],
  ],
  travel: [
    ["traveler with a small backpack", "walks through a narrow stone street", "old hillside town", "golden morning light", "footsteps progress slowly"],
    ["couple with luggage", "cross a quiet hotel lobby", "modern atrium", "soft skylight", "wheels roll across polished floor"],
    ["solo traveler", "looks over a coastal viewpoint", "windy cliff path", "bright ocean light", "jacket moves in the wind"],
    ["local guide", "points toward a market stall", "busy outdoor market", "mixed sunlight and shade", "crowd motion stays soft"],
    ["traveler", "boards a small train", "rural platform", "cool dawn light", "doors slide open"],
    ["hiker", "steps across a shallow stream", "forest trail", "dappled light", "water ripples around boots"],
    ["photographer", "raises a camera toward a temple gate", "historic courtyard", "late afternoon light", "people pass in the distance"],
    ["traveler", "opens curtains to a city view", "hotel room", "soft morning light", "curtain fabric moves aside"],
    ["food tourist", "receives a plate from a street vendor", "night market", "neon and stall lighting", "steam rises from the dish"],
    ["cyclist tourist", "rides slowly along a canal", "tree-lined path", "gentle daylight", "water reflections move beside the route"],
  ],
  screen_recording: [
    ["AI video generation interface", "edits a prompt in a text field", "browser workspace", "clean screen light", "cursor moves between settings"],
    ["analytics dashboard", "reviews a traffic chart", "desktop browser view", "neutral UI glow", "line graph updates through scrolling"],
    ["website builder", "adjusts a page section", "design canvas", "bright interface light", "cursor drags a layout block"],
    ["code editor", "adds a small function", "developer workspace", "dark UI light", "caret moves through the code"],
    ["chat application", "types a reply in a conversation", "messaging interface", "soft screen glow", "message bubble appears"],
    ["e-commerce page", "browses product tiles", "shopping website", "clean white interface light", "scroll reveals more items"],
    ["video editor", "trims a timeline clip", "editing workspace", "dark interface", "playhead moves across the timeline"],
    ["spreadsheet dashboard", "filters a data table", "productivity workspace", "flat UI lighting", "rows update after selection"],
    ["social media scheduler", "reviews a post preview", "content calendar interface", "clean app light", "cursor selects the publishing date"],
    ["AI image generator", "changes style settings before generation", "browser tool interface", "balanced screen glow", "preview panel updates"],
  ],
};

function loadProfile(platform) {
  return JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, `${platform}.json`), "utf8"));
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function platformPrompt(platform, profile, category, scene, index) {
  const [subject, action, environment, lighting, motion] = scene;
  const mood = category === "screen_recording" ? "precise workflow clarity" : category.includes("product") ? "polished commercial realism" : "grounded cinematic realism";
  const camera = category === "screen_recording" ? "static screen-recording framing" : index % 3 === 0 ? "slow controlled push-in" : index % 3 === 1 ? "locked-off medium framing" : "gentle handheld drift";
  const focus = category.includes("product") || category === "food" ? "shallow product-focused depth with background softly falling away" : "moderate depth of field with the subject held in focus";
  if (platform === "veo") {
    return `${camera} frames a ${subject} as the scene begins with ${lighting}. The subject ${action} in a ${environment}, with ${motion}. Keep the composition physically realistic, using ${focus}, natural material response, and smooth motion continuity. Ambient sound matches the location without adding dialogue. The emotional tone is ${mood}, with a polished cinematic finish.`;
  }
  if (platform === "sora") {
    return `${subject} in a ${environment}. The subject ${action} while ${lighting} defines the space. Camera uses ${camera}, keeping foreground and background relationships clear as ${motion}. As the moment unfolds, maintain temporal continuity, realistic spatial depth, and consistent subject placement. Visual style is cinematic, grounded, and detailed, with ${mood}.`;
  }
  if (platform === "runway") {
    return `${subject} in a ${environment}. The subject ${action}. Use ${camera} with clear composition and ${focus}. ${lighting} shapes the frame while ${motion}. Keep motion controlled, visually direct, and consistent across the shot. Style is concise cinematic realism with ${mood}.`;
  }
  if (platform === "kling") {
    return `${subject} ${action} in a ${environment}. ${camera} keeps composition explicit. ${motion}. ${lighting} reveals texture and form. Use realistic motion dynamics, clear body or object behavior, and grounded visual specificity. Mood: ${mood}, cinematic and direct.`;
  }
  return `${subject} ${action} in a ${environment}. ${camera}. ${motion}. ${lighting}. ${mood}, clear visual style, realistic motion, compact cinematic direction.`;
}

function validatePlatformCategory(platform, profile, category, examples) {
  const totalWords = examples.reduce((sum, prompt) => sum + wordCount(prompt), 0);
  const averageWords = totalWords / Math.max(1, examples.length);
  const min = profile.ideal_length?.minimum_words || 0;
  const max = profile.ideal_length?.maximum_words || 999;
  const requiredChecks = examples.map(prompt => {
    const text = prompt.toLowerCase();
    const hasCameraLanguage = /\b(camera|framing|frame|composition|push-in|locked-off|handheld|screen-recording|depth|focus|lens)\b/.test(text);
    const hasLightingLanguage = /\b(light|lighting|daylight|glow|lamp|sunlight|shadow|lit|overhead|window|shade|amber|cool|warm|bright|soft|practical|natural|diffused|directional|morning|afternoon|dawn|dark)\b/.test(text);
    const hasMotionLanguage = /\b(motion|moves|movement|drift|push-in|turns|turn|gestures|gesture|walks|walk|flows|flow|shifts|shift|scroll|scrolling|cursor|flickers|flicker|swirls|swirl|drizzle|lifts|lift|rests|examines|adjusts|leans|holds|pauses|speaks|explains|demonstrates|applies|rotates|slides|opens|reveals|sets|points|boards|looks|updates|edits|types|reviews|browses|trims|filters|selects|changes|stands|cross|raises|receives|ties|extends|throws|clips|rehearses)\b/.test(text);
    return { hasCameraLanguage, hasLightingLanguage, hasMotionLanguage };
  });
  const requiredPresent =
    requiredChecks.every(check => check.hasCameraLanguage && check.hasLightingLanguage) &&
    requiredChecks.filter(check => check.hasMotionLanguage).length >= 7;
  return {
    platform,
    category,
    count: examples.length,
    averageWords: Math.round(averageWords),
    countValid: examples.length === 10,
    platformMinimumValid: examples.length * CATEGORIES.length >= 20,
    lengthValid: averageWords >= min && averageWords <= max,
    requiredPresent,
  };
}

function main() {
  const results = [];
  for (const platform of PLATFORMS) {
    const profile = loadProfile(platform);
    const platformDir = path.join(ROOT, platform);
    fs.mkdirSync(platformDir, { recursive: true });
    for (const category of CATEGORIES) {
      const examples = SCENES[category].map((scene, index) => platformPrompt(platform, profile, category, scene, index));
      const payload = {
        platform: profile.platform || platform,
        category,
        examples,
      };
      fs.writeFileSync(path.join(platformDir, `${category}.json`), `${JSON.stringify(payload, null, 2)}\n`);
      console.log("[reference library generation]");
      console.log(JSON.stringify({ platform, category, generatedCount: examples.length }, null, 2));
      results.push(validatePlatformCategory(platform, profile, category, examples));
    }
  }
  const failed = results.filter(result => !result.countValid || !result.platformMinimumValid || !result.lengthValid || !result.requiredPresent);
  if (failed.length) {
    console.error(JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}

main();
