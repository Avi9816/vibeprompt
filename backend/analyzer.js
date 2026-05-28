// VibePrompt Analyzer v4.3 - Cinematic Motion-Aware
"use strict";
const fs    = require("fs");
const https = require("https");
const http  = require("http");
const path  = require("path");
const { execFile } = require("child_process");
const { getPreset } = require("./presets");

let lastAIResponseMeta=null;
const promptProfileCache=new Map();
const referencePatternCache=new Map();
const promptAssemblyContextCache=new Map();
let promptOptimizationRulesCache=null;

function promptIntelligenceEnabled() {
  return process.env.VP_PROMPT_INTELLIGENCE==="1";
}

function promptCriticEnabled() {
  return process.env.VP_PROMPT_CRITIC==="1";
}

function promptRefinementEnabled() {
  return process.env.VP_PROMPT_REFINEMENT==="1";
}

function languageRefinementEnabled() {
  return process.env.VP_LANGUAGE_REFINEMENT==="1";
}

function audioIntelligenceEnabled() {
  return process.env.VP_AUDIO_INTELLIGENCE==="1";
}

function feedbackOptimizationEnabled() {
  return process.env.VP_FEEDBACK_OPTIMIZATION==="1";
}

function promptGuardrailsEnabled() {
  return process.env.VP_PROMPT_GUARDRAILS==="1";
}

function reelEnergyEnabled() {
  return process.env.VP_REEL_ENERGY==="1";
}

function motionEnergyEnabled() {
  return process.env.VP_MOTION_ENERGY==="1";
}

function creatorArchetypeEnabled() {
  return process.env.VP_CREATOR_ARCHETYPE==="1";
}

function temporalProgressionEnabled() {
  return process.env.VP_TEMPORAL_PROGRESSION==="1";
}

function attentionDirectionEnabled() {
  return process.env.VP_ATTENTION_DIRECTION==="1";
}

function visualTranslationEnabled() {
  return process.env.VP_VISUAL_TRANSLATION==="1";
}

class PipelineDebugger {
  constructor() { this.events=[]; this.t=Date.now(); }
  log(stage,msg,data) {
    const e={stage,msg,ms:Date.now()-this.t};
    if(data!==undefined) e.data=data;
    this.events.push(e);
    console.log(`  [${stage}] ${msg}`, data?JSON.stringify(data).slice(0,120):"");
  }
  err(stage,msg,e) {
    this.events.push({stage,msg,error:e?.message||String(e),ms:Date.now()-this.t});
    console.error(`  [${stage}] ERR ${msg}:`,e?.message||e);
  }
  summary() { return {totalMs:Date.now()-this.t, steps:this.events}; }
}

function detectMime(buf) {
  if(buf[0]===0xFF&&buf[1]===0xD8) return "image/jpeg";
  if(buf[0]===0x89&&buf[1]===0x50) return "image/png";
  return "image/jpeg";
}

function dlBuffer(url,hops=6) {
  return new Promise((res,rej)=>{
    if(!hops) return rej(new Error("Too many redirects"));
    const proto=url.startsWith("https")?https:http;
    const req=proto.get(url,{
      rejectUnauthorized:false,
      headers:{"User-Agent":"Mozilla/5.0","Accept":"image/*","Referer":"https://www.instagram.com/"}
    },r=>{
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)
        return dlBuffer(r.headers.location,hops-1).then(res).catch(rej);
      if(r.statusCode!==200) return rej(new Error(`HTTP ${r.statusCode}`));
      const chunks=[];
      r.on("data",c=>chunks.push(c));
      r.on("end",()=>res(Buffer.concat(chunks)));
      r.on("error",rej);
    });
    req.on("error",rej);
    req.setTimeout(25000,()=>{req.destroy();rej(new Error("Timeout"));});
  });
}

async function loadImage(src,dbg) {
  let buf;
  if(src.startsWith("http")) { buf=await dlBuffer(src); }
  else {
    if(!fs.existsSync(src)) throw new Error("File not found: "+src);
    buf=fs.readFileSync(src);
    if(buf.toString("utf8",0,10).startsWith("MOCK_FRAME")) throw new Error("Mock frame - install ffmpeg");
  }
  if(buf.length<500) throw new Error(`Too small: ${buf.length}b`);
  const mime=detectMime(buf);
  const b64=buf.toString("base64");
  dbg.log("load","OK",{kb:Math.round(buf.length/1024),mime});
  return {base64:b64,mimeType:mime,sizeKB:Math.round(buf.length/1024)};
}

// - FRAME VALIDATION - Reject black/blank/invalid captures before sending to AI -
function validateImageData(base64, dbg) {
  try {
    const buf = Buffer.from(base64, "base64");
    const sizeKB = Math.round(buf.length / 1024);

    // Too small = almost certainly a blank/broken frame
    if (buf.length < 8000) {
      dbg.log("validate", "REJECTED - too small", { bytes: buf.length });
      return { valid: false, reason: "Image too small (likely blank frame)", sizeKB };
    }

    // Sample pixel brightness across the JPEG data heuristically.
    // JPEG byte values in the DCT payload correlate with image brightness.
    // A mostly-black image will have very low variance in the data bytes.
    // We skip the JPEG header (~400 bytes) and sample the payload.
    const headerSkip = Math.min(400, Math.floor(buf.length * 0.05));
    const sampleCount = 512;
    const step = Math.max(1, Math.floor((buf.length - headerSkip) / sampleCount));
    let sum = 0, sumSq = 0, n = 0;
    for (let i = headerSkip; i < buf.length && n < sampleCount; i += step, n++) {
      const v = buf[i];
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = (sumSq / n) - (mean * mean);

    dbg.log("validate", "Frame stats", {
      sizeKB,
      bytesMean: Math.round(mean),
      bytesVariance: Math.round(variance),
    });

    // Very low variance = nearly uniform = black/blank/solid color frame
    // Threshold tuned empirically: real content variance > 800, black frames < 100
    if (variance < 120) {
      dbg.log("validate", "REJECTED - low variance (black/blank frame)", { variance: Math.round(variance) });
      return { valid: false, reason: "Blank or black frame detected - try pausing the reel and retrying", sizeKB, variance: Math.round(variance) };
    }

    dbg.log("validate", "PASSED", { sizeKB, variance: Math.round(variance) });
    return { valid: true, sizeKB, variance: Math.round(variance) };
  } catch(e) {
    dbg.log("validate", "Validation error (allowing through)", { err: e.message });
    return { valid: true }; // Don't block on validation errors
  }
}

// - STAGE 1: FACTUAL GROUNDED ANALYSIS -
const S1_SYSTEM = `You are a forensic visual analyst. Return only facts visible in the supplied image/frame. Never invent clothing, colors, objects, environment, lighting, identity, action, or camera details. If a detail is not visible, write "not visible". If motion is inferred from a still frame, label it as inference.`;

function buildStage1Prompt(mediaType) {
  const isVideo = mediaType==="video";
  return `Analyze this Instagram ${isVideo ? "video frame sequence" : "image"} with maximum precision.

Return ONLY valid JSON. Return exactly one JSON object. Do not return arrays. Do not return multiple candidate analyses. Do not return alternative interpretations. Analyze all supplied frames together and produce one consolidated factual description. Do not generate prompts. Do not add cinematic styling.
${isVideo ? "If multiple frames are supplied, compare them in order and infer motion only from visible differences across frames. If frames show no change, use subject_motion \"none visible\", camera_motion \"static\", and environmental_motion \"none visible\". Do not hallucinate motion." : ""}
Analyze all supplied frames. Extract visible on-screen text only when readable. For overlay_text, return the exact visible text. For overlay_topic, return a short topic summary. Set text_present true only if readable text exists. If text is unreadable or absent, use overlay_text "", overlay_topic "", and text_present false.
For product content, identify the primary object, supporting objects, commercial hero element, and visible/supported product identity. For food content, identify the main food item, visible ingredients or toppings, emphasized texture/detail, and specific edible focus. Do not invent unseen branding, ingredients, packaging details, or objects.
{
  "content_type": "dominant content category: human_scene, product, animal, vehicle, landscape, food, ui_screenshot, document, screen_recording, interior_design, architecture, environment_scene, or other. If no humans, animals, products, vehicles, or UI are present, classify the dominant scene appropriately: living rooms as interior_design, buildings as architecture, landscapes or natural/ambient places as environment_scene.",
  "subjects": "count, age range, gender if visible, ethnicity if visible, body type",
  "face": "face shape, eye color/shape, eyebrow style, nose, lips, smile, facial hair, expression",
  "hair": "exact color, length, texture, style, movement if visible",
  "clothing_top": "exact garment, color(s), pattern, fabric texture, neckline, sleeves, visible details",
  "clothing_bottom": "garment, color, pattern, fabric, length",
  "footwear": "type, color, style or not visible",
  "accessories": "every visible item with exact description",
  "pose_action": "weight distribution, shoulder symmetry, arm position, hand tension, torso lean, neck tilt, leg stance, any visible movement",
  "visible_motion_cues": "${isVideo ? "visible or frame-inferred movement cues, clearly labeled as inference when not directly visible" : "not applicable for static image unless visibly implied by blur or pose"}",
  "inferred_motion": "${isVideo ? "inference from visible cues only, or not enough evidence" : "static image"}",
  "subject_motion": "${isVideo ? "motion visible across supplied frames, e.g. head turns left, walking forward, raises hand, or none visible" : "none visible"}",
  "camera_motion": "${isVideo ? "camera motion visible across supplied frames, e.g. static, slow push-in, handheld drift, lateral tracking" : "static"}",
  "environmental_motion": "${isVideo ? "environmental motion visible across supplied frames, e.g. hair moving, fabric fluttering, leaves swaying, or none visible" : "none visible"}",
  "environment": "exact setting, visible background elements, spatial depth",
  "surfaces": "floor/wall/background materials and colors",
  "lighting": "direction, quality (hard/soft), color temperature, visible light sources, shadow behavior",
  "color_palette": "5 dominant colors in the frame",
  "lens_feel": "estimated focal length, depth of field, bokeh, phone vs professional camera",
  "mood_atmosphere": "emotional tone from visible elements only",
  "overlay_text": "exact readable on-screen text, or empty string",
  "overlay_topic": "short topic summary if readable text exists, or empty string",
  "text_present": false,
  "scene_purpose": "factual 3-12 word purpose of the scene, or empty string",
  "activity_context": "factual 3-12 word activity context, or empty string",
  "content_theme": "factual 3-12 word content theme, or empty string",
  "audience_intent": "factual 3-12 word audience-facing intent, or empty string",
  "reel_type": "one allowed reel category, or other",
  "primary_object": "main visible product or food item, or empty string",
  "secondary_objects": ["supporting visible objects, ingredients, toppings, or empty array"],
  "hero_element": "main commercial focal point, texture, label, or visual detail, or empty string",
  "product_identity": "visible or OCR/speech-supported brand/product identity, or empty string",
  "food_focus": "specific edible item being presented, or empty string",
  "screen_context": "interface category for screen_recording or ui_screenshot, or empty string",
  "interaction_type": "user interaction type for screen_recording or ui_screenshot, or empty string",
  "workflow_stage": "workflow step for screen_recording or ui_screenshot, or empty string",
  "workflow_domain": "broader workflow domain for screen_recording or ui_screenshot, or empty string",
  "uncertain_details": ["details that are unclear, occluded, or should not be used as facts"]
}`;
}

// - STAGE 2: PROMPT GENERATION -
const VIDEO_SYSTEM = `You are a precision cinematographer and AI video prompt engineer. Every video prompt you write is based strictly on the supplied visual facts. You never invent generic filler.

HARD RULES - violation = failure:
1. FORBIDDEN PHRASES: "young woman turns", "gentle dolly", "serene expression", "lush foliage", "cinematic atmosphere", "dynamic energy" - these are stock AI clich-s. Use only specific observed details.
2. FORBIDDEN STRUCTURE: Never write "Open with" / "Start with" / "Then" / "Develop with" / "End with" / "Camera should" / "Beginning:" / "Middle:" / "End:"
3. FORBIDDEN PLACEHOLDERS: Never write [camera type] or [movement] - always name the exact technique.
4. SPECIFICITY REQUIRED: Every sentence must contain at least one concrete detail drawn from the visual analysis (a specific color, garment, surface, light source, movement cue, or texture). Generic sentences with no specific detail are rejected.
5. COMPLETION REQUIRED: Every prompt must end with a complete sentence and proper punctuation. An incomplete 50-word prompt beats a truncated 80-word prompt.
6. ALL FIELDS: runway, sora, pika, kling, veo must all be non-empty.

CORRECT (scene-specific): "A woman in a cropped deep-red ribbed knit top and high-waisted cream trousers walks through a sun-bleached concrete plaza, arms relaxed, hair catching the dry afternoon air. Camera performs a slow lateral slider move left to right, revealing the plaza depth behind her. Hard midday sun casts precise short shadows on the ground, skin catching warm direct light. ${"{p.suffix}"}"

WRONG (generic): "A young woman walks confidently through an urban environment. Camera dollies forward. Golden hour lighting creates a warm cinematic atmosphere."`;

const IMAGE_SYSTEM = `You are a precision photography and image-generation prompt engineer. Every image prompt you write is based strictly on the supplied visual facts. You never invent generic filler.

HARD RULES - violation = failure:
1. PHOTOGRAPHY ONLY: Write still-image prompts about photography, composition, clothing, lighting, materials, lens feel, and realism.
2. NO MOTION INSTRUCTIONS: Never include subject motion, camera motion, environmental motion, scene progression, transitions, dolly, tracking, push-in, orbit, pan, tilt, zoom, or handheld movement.
3. FORBIDDEN STRUCTURE: Never write "Open with" / "Start with" / "Then" / "Develop with" / "End with" / "Camera should" / "Beginning:" / "Middle:" / "End:"
4. SPECIFICITY REQUIRED: Every sentence must contain at least one concrete detail drawn from the visual analysis (a specific color, garment, surface, light source, composition detail, or texture).
5. REALISM REQUIRED: Describe believable photographic detail, accurate anatomy, garment construction, lighting direction, material texture, and lens/composition choices grounded in the visual facts.
6. COMPLETION REQUIRED: Every prompt must end with a complete sentence and proper punctuation.
7. ALL FIELDS: flux, midjourney, runway, kling, veo must all be non-empty.

CORRECT (scene-specific): "Photorealistic portrait of a woman wearing a cropped deep-red ribbed knit top and high-waisted cream trousers in a sun-bleached concrete plaza. Hard midday light creates short, precise shadows across the pale ground, with realistic skin texture, natural garment seams, and a clean editorial composition."

WRONG (motion): "A woman walks forward as the camera tracks beside her and wind moves through the plaza."`;

const RUNWAY_SYSTEM = `You are a commercial cinematographer writing a Runway video prompt.

Focus on framing, composition, camera choreography, and lens behavior. Write like a director guiding a camera operator. Do not emphasize blinking or facial micro-movements unless explicitly present in the grounded facts.

Return ONLY valid JSON for the requested field.`;

const SORA_SYSTEM = `You are an environmental storyteller writing a Sora video prompt.

Focus on environment, atmosphere, spatial depth, foreground/background relationships, and world detail. Environment and scene depth are more important than camera movement.

Return ONLY valid JSON for the requested field.`;

const KLING_SYSTEM = `You are a character-performance director writing a Kling video prompt.

Focus on expression, posture, gaze, body language, and human movement when those details are grounded in the facts. Character performance is primary.

Every Kling prompt must include one concise camera/composition sentence, such as "Medium portrait composition.", "Intimate portrait framing.", or "The locked-off camera observes their relaxed posture." Keep this sentence brief and secondary; do not make the prompt cinematography-heavy.

Return ONLY valid JSON for the requested field.`;

const VEO_SYSTEM = `You are a realism-focused cinematographer writing a Veo video prompt.

Focus on realism, lighting physics, shadows, material response, environmental interaction, and physically plausible movement.

Return ONLY valid JSON for the requested field.`;

const PIKA_SYSTEM = `You are a short-form motion prompt writer creating a concise Pika video prompt.

Use compact, action-first language with minimal cinematic filler. Keep the structure punchy while still satisfying the required output length.

Return ONLY valid JSON for the requested field.`;

const KEYFRAME_SYSTEM = `You write pure still-frame image descriptions.

No motion language. No camera movement. Describe only visible composition, subject, environment, lighting, materials, and lens feel from the grounded facts.

Return ONLY valid JSON for the requested field.`;

const FLUX_IMAGE_SYSTEM = `You write premium FLUX image prompts.

Focus on realism, photography language, lighting, composition, depth of field, and texture detail. Use only grounded visual facts.

Return ONLY valid JSON for the requested field.`;

const MIDJOURNEY_IMAGE_SYSTEM = `You write premium Midjourney image prompts.

Focus on visual richness, artistic style, composition, and image aesthetics while preserving grounded facts. Do not include Midjourney parameters such as --ar, --stylize, --style, or --v.

Return ONLY valid JSON for the requested field.`;

const NANO_BANANA_SYSTEM = `You write Nano Banana image prompts optimized for precise visual preservation.

Priority order: subject fidelity, facial accuracy, clothing accuracy, lighting realism, texture realism, pose preservation, and composition preservation. Use exact grounded facts only. Preserve visible identity cues, garment colors, garment shapes, accessories, pose, lighting direction, background, and material textures. Do not invent missing details.

Avoid cinematic buzzwords, blockbuster language, vague beauty language, excessive camera jargon, and generic style filler. Write a single detailed photorealistic image prompt.

Return ONLY valid JSON for the requested field.`;

const IMAGEN_SYSTEM = `You write Imagen image prompts.

Focus on factual accuracy, grounded visual description, and natural language. Keep the prompt clear, literal, and visually complete.

Return ONLY valid JSON for the requested field.`;

const RECRAFT_SYSTEM = `You write Recraft image prompts.

Focus on design clarity, clean composition, commercial visual quality, readable forms, controlled color, and polished presentation.

Return ONLY valid JSON for the requested field.`;

const SDXL_SYSTEM = `You write SDXL image prompts.

Focus on detailed visual description, realistic materials, camera and lighting detail, natural anatomy, and grounded photorealism.

Return ONLY valid JSON for the requested field.`;


function s2Prompt(factual, mediaType, preset) {
  const p = getPreset(preset||"cinematic");
  const isVideo = mediaType==="video";
  const factsJSON = JSON.stringify(factual);
  const motionFacts = generateImageMotionFacts(factual);
  const cameraGrammar = generateCameraLanguage(factual, mediaType);
  const motionScore = isVideo ? calculateMotionScore({
    subjectMotion: usableFact(factual?.inferred_motion) && !/not enough evidence/i.test(cleanFact(factual?.inferred_motion))
      ? cleanFact(factual.inferred_motion)
      : motionFacts.subjectMotion,
    environmentalMotion: motionFacts.environmentalMotion,
    cameraMotion: cameraGrammar.cameraMotion,
    sceneProgression: usableFact(factual?.visible_motion_cues) ? cleanFact(factual.visible_motion_cues) : "",
  }) : 10;
  const groundingRules = `GROUNDING RULES:
- Use ONLY facts present in STAGE_1_FACTS.
- Omit absent, uncertain, "not visible", or "not enough evidence" facts.
- Never invent or substitute generic clothing, colors, fabric, location, lighting source, props, camera movement, environmental effects, or scene progression.
- Preserve exact wording for specific facts, e.g. "red sequined sari" stays "red sequined sari".
- Every prompt must be complete, non-empty, and end with punctuation.`;

  if(isVideo) {
    return `You are generating FINAL video generation prompts from grounded facts only.

STAGE_1_FACTS:
${factsJSON}

MOTION_SYNTHESIS:
${JSON.stringify(motionFacts)}

CAMERA_GRAMMAR:
${JSON.stringify(cameraGrammar)}

${groundingRules}

Style preset: ${p.label} | ${p.grade} | ${p.pace} | ${p.suffix}

Write as an elite commercial cinematographer and AI video director. Do not list facts mechanically. Convert facts into natural cinematic prose.

Every video prompt must include: subject description, subject motion, camera motion, environmental motion, lighting behavior, lens behavior, atmosphere, and a cinematic ending style statement.

Begin with directed cinematic language such as "A slow cinematic push-in begins on..." rather than flat caption language such as "A woman sits...".

Platform specialization:
- RUNWAY: camera movement, cinematic language, commercial realism.
- SORA: scene depth, environmental detail, progression language.
- PIKA: punchy motion-focused commercial prompt, still at least 60 words.
- KLING: character motion, body language, facial expression.
- VEO: realism, lighting behavior, environmental interaction.
- KEYFRAME: purely visual still-frame description; no motion language.

Return ONLY valid JSON. All fields required and non-empty:
{
  "runway": "75-95 word video prompt.",
  "sora": "85-110 word video prompt.",
  "pika": "60-75 word video prompt.",
  "kling": "75-95 word video prompt.",
  "veo": "75-95 word video prompt.",
  "keyframe": "55-75 word still-image prompt.",
  "negative": "20-35 word negative prompt.",
  "camera_spec": "short camera/lens notation.",
  "motion_score": ${motionScore},
  "scene_progression": "one sentence grounded in Stage 1.",
  "camera_motion": "grounded camera motion or not enough evidence.",
  "environmental_motion": "grounded ambient motion or not enough evidence.",
  "style_tags": ["tag1","tag2","tag3","tag4","tag5"]
}`;

  } else {
    return `You are generating FINAL still-image prompts from grounded facts only.

STAGE_1_FACTS:
${factsJSON}

CAMERA_GRAMMAR:
${JSON.stringify(cameraGrammar)}

${groundingRules}

Style preset: ${p.label} | ${p.grade} | ${p.lens} | ${p.suffix}

Write completed photorealistic image prompts about photography, composition, clothing, lighting, materials, lens feel, and realism. Do not include subject motion, camera motion, scene progression, transitions, or environmental motion.

Return ONLY valid JSON. All fields required and non-empty:
{
  "flux": "70-100 word image prompt.",
  "midjourney": "60-90 word image prompt ending with --ar 4:5 --style raw --v 6.1.",
  "runway": "50-70 word still-image prompt.",
  "kling": "50-70 word still-image prompt.",
  "veo": "50-70 word still-image prompt.",
  "keyframe": "60-90 word image prompt.",
  "negative": "20-35 word negative prompt.",
  "camera_spec": "short photography notation.",
  "style_tags": ["tag1","tag2","tag3","tag4","tag5"]
}`;
  }
}

function systemPromptForMedia(mediaType) {
  return mediaType==="video" ? VIDEO_SYSTEM : IMAGE_SYSTEM;
}

function cleanFact(v) {
  if(Array.isArray(v)) return v.filter(Boolean).join(", ");
  if(v && typeof v==="object") return Object.values(v).filter(Boolean).join(", ");
  return String(v||"").trim();
}

function usableFact(v) {
  const s=cleanFact(v).toLowerCase();
  return s && s!=="not visible" && s!=="unknown" && s!=="n/a" && s!=="not applicable";
}

function generateImageMotionFacts(factual) {
  const subjectMotionFact=cleanFact(factual?.subject_motion);
  const cameraMotionFact=cleanFact(factual?.camera_motion);
  const environmentalMotionFact=cleanFact(factual?.environmental_motion);
  const visibleMotionFact=cleanFact(factual?.visible_motion_cues);
  const inferredMotionFact=cleanFact(factual?.inferred_motion);
  const hasSubjectMotion=usableFact(subjectMotionFact)&&!/^(none|none visible|not visible|not enough evidence|static)$/i.test(subjectMotionFact);
  const hasVisibleMotion=usableFact(visibleMotionFact)&&!/^(none|none visible|no visible motion cues|not visible|not applicable|not enough evidence|static|static image)$/i.test(visibleMotionFact);
  const hasInferredMotion=usableFact(inferredMotionFact)&&!/^(none|none visible|no visible motion cues|not visible|not applicable|not enough evidence|static|static image)$/i.test(inferredMotionFact);
  const hasCameraMotion=usableFact(cameraMotionFact)&&!/^(none|none visible|not visible|not enough evidence|static)$/i.test(cameraMotionFact);
  const hasEnvironmentalMotion=usableFact(environmentalMotionFact)&&!/^(none|none visible|not visible|not enough evidence|static)$/i.test(environmentalMotionFact);
  if(hasSubjectMotion||hasVisibleMotion||hasInferredMotion||hasCameraMotion||hasEnvironmentalMotion) {
    return {
      subjectMotion:hasSubjectMotion ? subjectMotionFact : hasVisibleMotion ? visibleMotionFact : hasInferredMotion ? inferredMotionFact : "none visible",
      environmentalMotion:hasEnvironmentalMotion ? environmentalMotionFact : "none visible",
      cameraMotion:hasCameraMotion ? cameraMotionFact : "static",
    };
  }

  const visibleMotion=cleanFact(factual?.visible_motion_cues).toLowerCase();
  const inferredMotion=cleanFact(factual?.inferred_motion).toLowerCase();
  const noMotionEvidence=
    /^(|none|none visible|no visible motion cues|not visible|not applicable|no motion|static image)$/.test(visibleMotion) &&
    /^(|not enough evidence|none|none visible|not visible|unknown|static image)$/.test(inferredMotion);

  if(noMotionEvidence) {
    return {
      subjectMotion: "static pose held in a composed stillness",
      environmentalMotion: "still environment with no visible motion cues",
      cameraMotion: "locked-off composition with static framing",
    };
  }

  const hair=cleanFact(factual?.hair).toLowerCase();
  const clothing=[cleanFact(factual?.clothing_top),cleanFact(factual?.clothing_bottom)].join(" ").toLowerCase();
  const pose=cleanFact(factual?.pose_action);
  const environment=cleanFact(factual?.environment).toLowerCase();

  const subject=[];
  if(usableFact(factual?.face)) subject.push("natural breathing and gentle blinking");
  if(usableFact(pose)) subject.push("a subtle relaxed posture shift");
  if(hair && !hair.includes("not visible")) subject.push("soft hair movement");
  if(clothing && !clothing.includes("not visible")) subject.push("light fabric settling naturally");

  const env=[];
  if(/outdoor|street|beach|garden|wind|open|rooftop|balcony/.test(environment)) env.push("a faint breeze moving through the scene");
  if(usableFact(factual?.lighting)) env.push(`grounded lighting behavior: ${cleanFact(factual.lighting)}`);

  return {
    subjectMotion: subject.length ? subject.join(", ") : "natural breathing, gentle blinking, and a barely perceptible posture shift",
    environmentalMotion: env.length ? env.join(", ") : "subtle ambient stillness with delicate light falloff",
    cameraMotion: "slow cinematic push-in or locked-off composition with subtle handheld drift",
  };
}

function groundedMotionSummary(factual) {
  const motionFacts=generateImageMotionFacts(factual);
  return {
    subject_motion:motionFacts.subjectMotion,
    visible_motion_cues:cleanFact(factual?.visible_motion_cues)||"none visible",
    inferred_motion:cleanFact(factual?.inferred_motion)||"not enough evidence",
    camera_motion:motionFacts.cameraMotion,
    environmental_motion:motionFacts.environmentalMotion,
  };
}

function speechTopicContext(factual) {
  const speechPresent=factual?.speech_present===true || String(factual?.speech_present).trim().toLowerCase()==="true";
  if(!speechPresent) return {spoken_topic:"",speaker_intent:""};
  return {
    spoken_topic:cleanFact(factual?.spoken_topic),
    speaker_intent:cleanFact(factual?.speaker_intent),
  };
}

function speechConfidenceContext(factual) {
  return {
    confidence_speech:Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0)),
  };
}

function speechLanguageContext(factual) {
  const confidence=Math.max(0,Math.min(1,Number(factual?.speech_language_confidence)||0));
  return {
    speech_language:cleanFact(factual?.speech_language),
    speech_language_confidence:confidence,
  };
}

function isLyricTranscript(transcript) {
  const text=String(transcript||"").trim();
  if(/[\u266a\u266b]/.test(text)) return true;
  return /[♪♫]/.test(text)||/^\s*(\[[^\]]*(music|song|singing|lyrics)[^\]]*\]|(la\s+){2,}|(na\s+){2,})/i.test(text);
}

function conciseWords(text, maxWords=10) {
  return cleanFact(text).split(/\s+/).filter(Boolean).slice(0,maxWords).join(" ");
}

function deriveDialogueSummary(factual) {
  const confidenceSpeech=Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0));
  if(confidenceSpeech<0.5) return "";
  const topic=cleanFact(factual?.spoken_topic);
  const intent=cleanFact(factual?.speaker_intent);
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const combined=[topic,intent].filter(usableFact).join(" ");
  if(combined) return conciseWords(combined,10);
  if(/educational|tutorial|software|screen/.test([reelType,contentType].join(" "))) return "explaining the workflow";
  if(/product/.test([reelType,contentType].join(" "))) return "introducing the product";
  return "speaking directly to camera";
}

function deriveMusicMood(factual) {
  if(!isLyricTranscript(factual?.transcript)) return "";
  const text=[
    cleanFact(factual?.mood_atmosphere),
    cleanFact(factual?.reel_type),
    cleanFact(factual?.content_type),
    cleanFact(factual?.scene_purpose),
  ].join(" ").toLowerCase();
  if(/\bfitness|dance|sport|energetic|high[- ]energy|workout\b/.test(text)) return "high-energy electronic music";
  if(/\bfashion|travel|lifestyle|upbeat|market|street\b/.test(text)) return "upbeat pop music";
  if(/\bdramatic|cinematic|moody|epic\b/.test(text)) return "dramatic cinematic music";
  if(/\bcalm|soft|serene|beauty|skincare|interior|ambient\b/.test(text)) return "calm ambient music";
  return "soft cinematic music";
}

function deriveAmbientAudio(factual) {
  const text=[
    cleanFact(factual?.environment),
    cleanFact(factual?.surfaces),
    cleanFact(factual?.content_type),
    cleanFact(factual?.reel_type),
    cleanFact(factual?.scene_purpose),
  ].join(" ").toLowerCase();
  if(/\bcafe|coffee|restaurant|kitchen\b/.test(text)) return "soft cafe ambience";
  if(/\bstreet|traffic|market|city|urban\b/.test(text)) return "street traffic ambience";
  if(/\bforest|garden|nature|beach|ocean|river|trail|outdoor\b/.test(text)) return "nature ambience";
  if(/\boffice|workspace|desk|screen|software|computer|interface\b/.test(text)) return "office ambience";
  if(/\bstadium|crowd|event|audience\b/.test(text)) return "crowd ambience";
  return "";
}

function deriveAudioIntelligence(factual) {
  const enhancedAudio=audioIntelligenceEnabled();
  const speechPresent=factual?.speech_present===true || String(factual?.speech_present).trim().toLowerCase()==="true";
  const confidenceSpeech=Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0));
  const lyricDetected=isLyricTranscript(factual?.transcript);
  const hasSpeech=speechPresent&&confidenceSpeech>=0.5&&!lyricDetected;
  const musicMood=deriveMusicMood(factual);
  const hasMusic=lyricDetected||Boolean(musicMood);
  const ambientAudio=enhancedAudio ? deriveAmbientAudio(factual) : "";
  let audioType="none";
  if(hasMusic&&hasSpeech) audioType="speech_and_music";
  else if(hasMusic) audioType="music";
  else if(hasSpeech) audioType="speech";
  else if(ambientAudio) audioType="ambient_audio";

  let audioRole="";
  if(audioType==="speech") audioRole="primary spoken guidance";
  else if(audioType==="music") audioRole="background music only";
  else if(audioType==="speech_and_music") audioRole="spoken guidance with background music";
  else if(audioType==="ambient_audio") audioRole="environmental ambience only";

  const dialogueSummary=hasSpeech ? deriveDialogueSummary(factual) : "";
  const result={
    audio_type:audioType,
    audio_role:audioRole,
    dialogue_summary:dialogueSummary,
    music_mood:["music","speech_and_music"].includes(audioType) ? musicMood : "",
    ambient_audio:audioType==="ambient_audio" ? ambientAudio : "",
  };
  console.log("[audio intelligence]");
  console.log(JSON.stringify(result,null,2));
  return result;
}

function deriveReelEnergyIntelligence(factual) {
  const empty={
    reel_energy:"",
    performance_style:"",
    social_aesthetic:"",
    motion_style:"",
    viewer_feeling:"",
    camera_presence:"",
    music_sync_energy:"",
  };
  if(!reelEnergyEnabled()) {
    console.log("[reel energy intelligence]");
    console.log(JSON.stringify(empty,null,2));
    return empty;
  }
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const audioType=cleanFact(factual?.audio_type).toLowerCase();
  const text=[
    contentType,
    reelType,
    cleanFact(factual?.subjects),
    cleanFact(factual?.pose_action),
    cleanFact(factual?.subject_motion),
    cleanFact(factual?.visible_motion_cues),
    cleanFact(factual?.inferred_motion),
    cleanFact(factual?.mood_atmosphere),
    cleanFact(factual?.scene_purpose),
    cleanFact(factual?.activity_context),
    cleanFact(factual?.content_theme),
    cleanFact(factual?.overlay_topic),
    cleanFact(factual?.spoken_topic),
  ].join(" ").toLowerCase();
  const result={...empty};
  const portrait=/fashion|beauty|lifestyle|portrait|model|posing|pose|head turn|eye contact|gaze|expression|hair|makeup|outfit|dress|sari|saree|jewelry|skincare/.test(text);
  const dance=/dance|dancing|music_performance/.test(text);
  const talking=/talking_head|educational|motivational|speaking|explaining|presenting|teaching|camera-facing/.test(text);
  const food=contentType==="food"||/food|recipe|cooking|preparation|spread|bread|ingredient|topping|coffee|snack/.test(text);
  const product=contentType==="product"||/product|showcase|unboxing|review|packaging|brand|label|skincare|cosmetic/.test(text);
  if(portrait||["fashion_portrait","beauty_portrait","lifestyle_portrait"].includes(reelType)) {
    result.reel_energy=/confident|bold|expressive|eye contact|posing|rhythmic/i.test(text)
      ? "confident fashion portrait reel"
      : "camera-aware portrait reel";
    result.performance_style=/rhythm|turn|posing|gesture|head|gaze|expression/i.test(text)
      ? "rhythmic portrait posing"
      : "camera-aware portrait presence";
    result.social_aesthetic=/beauty|makeup|skincare/i.test(text) ? "Instagram beauty reel" : "social-media fashion reel";
    result.motion_style=/rhythm|turn|posing|gesture|head|gaze|expression/i.test(text)
      ? "rhythmic expressive posing"
      : "natural influencer-style movement";
    result.viewer_feeling="stylish and attractive";
    result.camera_presence=/eye contact|camera|gaze|selfie|portrait/i.test(text) ? "subject aware of the camera" : "camera-aware expression";
    if(["music","speech_and_music"].includes(audioType)||dance) {
      result.music_sync_energy="movement timed naturally to social-video music";
    }
  } else if(food) {
    result.reel_energy="satisfying food presentation";
    result.performance_style="ingredient-focused preparation";
    result.social_aesthetic="viral food reel";
    result.motion_style=/spread|pour|mix|stir|slice|serve|drizzle|scoop|apply/i.test(text)
      ? "slow texture-focused movement"
      : "texture-focused food presentation";
    result.viewer_feeling="satisfying and appetizing";
    result.camera_presence="food-focused close viewing";
  } else if(product) {
    result.reel_energy="commercial product showcase";
    result.performance_style=/creator|hands|holding|presenting|unboxing|opening/i.test(text)
      ? "creator-driven presentation"
      : "product-led presentation";
    result.social_aesthetic=/beauty|skincare|cosmetic/i.test(text) ? "beauty influencer advertisement" : "social product reel";
    result.motion_style="polished product reveal pacing";
    result.viewer_feeling="clean and persuasive";
    result.camera_presence="product presented to camera";
  } else if(talking) {
    result.reel_energy="direct educational presentation";
    result.performance_style="camera-facing explanation";
    result.social_aesthetic="informational creator reel";
    result.motion_style="clear speaking cadence";
    result.viewer_feeling="focused and informative";
    result.camera_presence="presenter addresses the camera";
  }
  if(result.camera_presence&&/static|locked-off|locked off/i.test(cleanFact(factual?.camera_motion))&&portrait&&!/none visible|not enough evidence/i.test(cleanFact(factual?.visible_motion_cues))) {
    result.camera_presence+=" with subtle handheld portrait realism";
  }
  console.log("[reel energy intelligence]");
  console.log(JSON.stringify(result,null,2));
  return result;
}

function deriveMotionEnergyIntelligence(factual) {
  const empty={
    dance_energy:"",
    movement_density:"",
    motion_rhythm:"",
    body_motion_style:"",
    beat_sync_strength:"",
    performance_intensity:"",
    camera_engagement:"",
    movement_continuity:"",
    motion_focus:"",
  };
  if(!motionEnergyEnabled()) {
    console.log("[motion energy intelligence]");
    console.log(JSON.stringify(empty,null,2));
    return empty;
  }
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const audioType=cleanFact(factual?.audio_type).toLowerCase();
  const motionText=[
    reelType,
    contentType,
    cleanFact(factual?.subject_motion),
    cleanFact(factual?.visible_motion_cues),
    cleanFact(factual?.inferred_motion),
    cleanFact(factual?.pose_action),
    cleanFact(factual?.activity_context),
    cleanFact(factual?.performance_style),
    cleanFact(factual?.motion_style),
    cleanFact(factual?.music_sync_energy),
    cleanFact(factual?.mood_atmosphere),
    cleanFact(factual?.overlay_topic),
  ].join(" ").toLowerCase();
  const result={...empty};
  const hasMusic=["music","speech_and_music"].includes(audioType)||/\bmusic|song|beat|rhythm|dance\b/.test(motionText);
  const continuous=/\b(continuous|repeated|flowing|full-body|full body|jump|run|running|dance|dancing|workout|exercise|lift|lifting|squat|sprinting|kick|throw|hit|swing|athletic|sports|fast|rapid|energetic|rhythmic)\b/.test(motionText);
  const dance=/\b(dance|dancing|music_performance|rhythmic|beat|pose transitions|expressive movement)\b/.test(motionText);
  const gym=/\b(gym|fitness|workout|exercise|lifting|squat|pushup|training|athletic movement)\b/.test(motionText);
  const sports=/\b(sport|sports|football|cricket|basketball|tennis|running|sprinting|kick|throw|hit|swing|reactive|highlight)\b/.test(motionText);
  if(dance&&(continuous||hasMusic)) {
    result.dance_energy="high-energy social-media dance reel";
    result.movement_density="continuous full-body movement";
    result.motion_rhythm="strong rhythmic cadence";
    result.body_motion_style="expressive music-driven movement";
    result.beat_sync_strength=hasMusic ? "movement synchronized naturally to upbeat music" : "movement follows a clear rhythmic cadence";
    result.performance_intensity="high";
    result.camera_engagement=/camera|eye contact|front|selfie|portrait/.test(motionText) ? "performer actively engaging with the camera" : "camera-aware dance performance";
    result.movement_continuity="continuous flowing motion";
    result.motion_focus="full-body performance";
  } else if(gym&&continuous) {
    result.dance_energy="energetic fitness reel";
    result.movement_density="repeated athletic movement";
    result.motion_rhythm="driven training cadence";
    result.body_motion_style="power-driven athletic movement";
    result.beat_sync_strength=hasMusic ? "movement paced naturally to music" : "";
    result.performance_intensity="high";
    result.camera_engagement="focused camera-aware performance";
    result.movement_continuity="continuous workout motion";
    result.motion_focus="athletic body movement";
  } else if(sports&&continuous) {
    result.dance_energy="dynamic sports highlight energy";
    result.movement_density="fast reactive movement";
    result.motion_rhythm="quick athletic cadence";
    result.body_motion_style="fast reactive athletic motion";
    result.beat_sync_strength=hasMusic ? "movement cut with music-video pacing" : "";
    result.performance_intensity="high";
    result.camera_engagement="camera follows the athletic action";
    result.movement_continuity="dynamic continuous action";
    result.motion_focus="sports performance";
  } else if(continuous&&hasMusic) {
    result.dance_energy="energetic social-media reel cadence";
    result.movement_density="active repeated movement";
    result.motion_rhythm="music-driven rhythm";
    result.body_motion_style="expressive social-video movement";
    result.beat_sync_strength="movement synchronized naturally to music";
    result.performance_intensity="medium-high";
    result.camera_engagement="camera-aware performance";
    result.movement_continuity="flowing motion continuity";
    result.motion_focus="body movement";
  }
  console.log("[motion energy intelligence]");
  console.log(JSON.stringify(result,null,2));
  return result;
}

function deriveCreatorArchetype(factual) {
  const empty={
    creator_archetype:"",
    creator_presence:"",
    content_personality:"",
    social_platform_style:"",
    presentation_style:"",
    viewer_relationship:"",
  };
  if(!creatorArchetypeEnabled()) {
    console.log("[creator archetype]");
    console.log(JSON.stringify(empty,null,2));
    return empty;
  }
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const text=[
    contentType,
    reelType,
    cleanFact(factual?.subjects),
    cleanFact(factual?.clothing_top),
    cleanFact(factual?.clothing_bottom),
    cleanFact(factual?.accessories),
    cleanFact(factual?.pose_action),
    cleanFact(factual?.scene_purpose),
    cleanFact(factual?.activity_context),
    cleanFact(factual?.content_theme),
    cleanFact(factual?.reel_energy),
    cleanFact(factual?.performance_style),
    cleanFact(factual?.social_aesthetic),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.body_motion_style),
    cleanFact(factual?.screen_context),
    cleanFact(factual?.workflow_domain),
    cleanFact(factual?.overlay_topic),
    cleanFact(factual?.spoken_topic),
    cleanFact(factual?.product_identity),
    cleanFact(factual?.food_focus),
  ].join(" ").toLowerCase();
  const result={...empty};
  const beauty=/beauty|makeup|skincare|cosmetic|glam|hair|jewelry|fashion_portrait|beauty_portrait|instagram beauty/.test(text);
  const fashion=/fashion|outfit|style|dress|sari|saree|portrait posing|model|lookbook|editorial/.test(text);
  const fitness=/fitness|gym|workout|training|exercise|athletic|power-driven/.test(text);
  const food=contentType==="food"||/food|recipe|cooking|ingredient|bread|spread|coffee|snack|viral food/.test(text);
  const gaming=/game|gaming|stream|streamer|console|controller|esports/.test(text);
  const tech=/software|ai tool|workflow|screen_recording|ui_screenshot|tech|coding|tutorial|educational|explaining|teaching|ai video|ai image|website|app/.test(text);
  const lifestyle=/lifestyle|vlog|travel|daily|home|routine|wellness|creator reel/.test(text);
  if(beauty) {
    result.creator_archetype="beauty influencer";
    result.creator_presence="camera-aware confident creator presence";
    result.content_personality="stylish and feminine";
    result.social_platform_style="Instagram beauty reel";
    result.presentation_style="visual-first influencer presentation";
    result.viewer_relationship="direct audience-facing engagement";
  } else if(fashion) {
    result.creator_archetype="fashion creator";
    result.creator_presence="confident camera-aware creator presence";
    result.content_personality="stylish and expressive";
    result.social_platform_style="Instagram fashion reel";
    result.presentation_style="pose-led fashion presentation";
    result.viewer_relationship="audience-facing style showcase";
  } else if(fitness) {
    result.creator_archetype="fitness creator";
    result.creator_presence="focused performance presence";
    result.content_personality="energetic and disciplined";
    result.social_platform_style="fitness reel";
    result.presentation_style="performance-focused fitness content";
    result.viewer_relationship="motivational audience-facing engagement";
  } else if(food) {
    result.creator_archetype="food creator";
    result.creator_presence="hands-on creator presence";
    result.content_personality="satisfying and appetizing";
    result.social_platform_style="viral food reel";
    result.presentation_style="ingredient-focused food presentation";
    result.viewer_relationship="viewer-focused food demonstration";
  } else if(gaming) {
    result.creator_archetype="gamer streamer";
    result.creator_presence="screen-aware creator presence";
    result.content_personality="energetic and reactive";
    result.social_platform_style="gaming content clip";
    result.presentation_style="screen-led gaming commentary";
    result.viewer_relationship="direct community-facing engagement";
  } else if(tech) {
    result.creator_archetype="tech educator";
    result.creator_presence="clear instructional creator presence";
    result.content_personality="practical and informative";
    result.social_platform_style="educational tech reel";
    result.presentation_style="direct-to-camera or screen-led explanation";
    result.viewer_relationship="teaching-focused audience relationship";
  } else if(lifestyle) {
    result.creator_archetype="lifestyle vlogger";
    result.creator_presence="casual camera-aware creator presence";
    result.content_personality="warm and relatable";
    result.social_platform_style="lifestyle reel";
    result.presentation_style="personal creator presentation";
    result.viewer_relationship="friendly audience-facing engagement";
  }
  console.log("[creator archetype]");
  console.log(JSON.stringify(result,null,2));
  return result;
}

function deriveTemporalReelProgression(factual) {
  const empty={
    temporal_opening:"",
    temporal_progression:"",
    temporal_continuity:"",
    moment_flow:"",
    scene_evolution:"",
    performance_progression:"",
  };
  if(!temporalProgressionEnabled()) {
    console.log("[temporal progression intelligence]");
    console.log(JSON.stringify(empty,null,2));
    return empty;
  }
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const text=[
    contentType,
    reelType,
    cleanFact(factual?.creator_archetype),
    cleanFact(factual?.presentation_style),
    cleanFact(factual?.reel_energy),
    cleanFact(factual?.performance_style),
    cleanFact(factual?.social_aesthetic),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.movement_density),
    cleanFact(factual?.motion_rhythm),
    cleanFact(factual?.body_motion_style),
    cleanFact(factual?.subject_motion),
    cleanFact(factual?.visible_motion_cues),
    cleanFact(factual?.pose_action),
    cleanFact(factual?.activity_context),
    cleanFact(factual?.food_focus),
    cleanFact(factual?.primary_object),
    cleanFact(factual?.spoken_topic),
  ].join(" ").toLowerCase();
  const result={...empty};
  const beautyFashion=/beauty|fashion|portrait|influencer|posing|instagram beauty|instagram fashion|social-media fashion/.test(text);
  const danceMusic=/dance|dancing|music|rhythm|beat|continuous full-body|music-driven|performance/.test(text);
  const food=contentType==="food"||/food|recipe|ingredient|preparation|spread|texture|bread|topping|cooking/.test(text);
  const talking=/talking_head|educational|presenter|speaking|explaining|teaching|direct-to-camera|camera-facing explanation/.test(text);
  const product=contentType==="product"||/product|showcase|unboxing|packaging|label|commercial/.test(text);
  if(danceMusic) {
    result.temporal_opening="the reel opens with energetic performance framing";
    result.temporal_progression="movement continues through rhythmic body motion";
    result.temporal_continuity="the performance flows continuously without invented choreography";
    result.moment_flow="the reel maintains music-video pacing";
    result.scene_evolution="camera presence and body motion evolve naturally over time";
    result.performance_progression="camera-aware movement builds through the performance cadence";
  } else if(beautyFashion) {
    result.temporal_opening="the reel opens with confident portrait framing";
    result.temporal_progression="the subject shifts naturally through expressive poses";
    result.temporal_continuity="movement flows continuously without abrupt transitions";
    result.moment_flow="the reel maintains relaxed rhythmic pacing";
    result.scene_evolution="the framing and expression evolve subtly over time";
    result.performance_progression="camera-aware posing becomes gradually more expressive";
  } else if(food) {
    result.temporal_opening="the preparation begins with the food already visible";
    result.temporal_progression="texture and food motion develop naturally through the shot";
    result.temporal_continuity="the preparation continues fluidly without invented cuts";
    result.moment_flow="the reel follows satisfying food-preparation pacing";
    result.scene_evolution="the food presentation becomes increasingly satisfying";
    result.performance_progression="the visible preparation remains focused on texture and ingredients";
  } else if(talking) {
    result.temporal_opening="the presenter begins speaking directly to the camera";
    result.temporal_progression="natural gestures and explanation continue fluidly";
    result.temporal_continuity="the speaking moment holds a continuous direct-to-camera rhythm";
    result.moment_flow="the reel keeps a clear explanatory cadence";
    result.scene_evolution="expression and gestures evolve subtly with the explanation";
    result.performance_progression="the presentation builds through steady audience-facing delivery";
  } else if(product) {
    result.temporal_opening="the reel opens on the product presentation";
    result.temporal_progression="attention moves gradually across the visible product details";
    result.temporal_continuity="the product showcase maintains smooth commercial pacing";
    result.moment_flow="the moment stays focused on product clarity";
    result.scene_evolution="the product details become more prominent over time";
    result.performance_progression="the presentation keeps the product as the visual focus";
  }
  console.log("[temporal progression intelligence]");
  console.log(JSON.stringify(result,null,2));
  return result;
}

function deriveAttentionDirectionIntelligence(factual) {
  const empty={
    primary_visual_focus:"",
    secondary_visual_focus:"",
    attention_progression:"",
    focus_transition:"",
    camera_intention:"",
    visual_priority_flow:"",
  };
  if(!attentionDirectionEnabled()) {
    console.log("[attention direction intelligence]");
    console.log(JSON.stringify(empty,null,2));
    return empty;
  }
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const text=[
    contentType,
    reelType,
    cleanFact(factual?.creator_archetype),
    cleanFact(factual?.social_platform_style),
    cleanFact(factual?.presentation_style),
    cleanFact(factual?.reel_energy),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.performance_style),
    cleanFact(factual?.motion_style),
    cleanFact(factual?.body_motion_style),
    cleanFact(factual?.primary_object),
    cleanFact(factual?.hero_element),
    cleanFact(factual?.product_identity),
    cleanFact(factual?.food_focus),
    cleanFact(factual?.subjects),
    cleanFact(factual?.face),
    cleanFact(factual?.hair),
    cleanFact(factual?.clothing_top),
    cleanFact(factual?.clothing_bottom),
    cleanFact(factual?.pose_action),
    cleanFact(factual?.subject_motion),
    cleanFact(factual?.visible_motion_cues),
  ].join(" ").toLowerCase();
  const result={...empty};
  const beautyFashion=/beauty|fashion|portrait|influencer|face|eye contact|expression|posing|hair|outfit|makeup|skincare/.test(text);
  const food=contentType==="food"||/food|ingredient|texture|spread|pour|gloss|bread|topping|preparation/.test(text);
  const product=contentType==="product"||/product|branding|packaging|label|unboxing|showcase|commercial|skincare/.test(text);
  const dance=/dance|dancing|full-body|full body|performance|rhythmic|music-driven|energetic/.test(text);
  const talking=/talking_head|educational|presenter|speaking|explaining|camera-facing/.test(text);
  if(dance) {
    result.primary_visual_focus="full-body movement and performance energy";
    result.secondary_visual_focus="camera engagement and motion rhythm";
    result.attention_progression="attention follows the body movement through the performance cadence";
    result.focus_transition="visual emphasis moves naturally between movement intensity and camera engagement";
    result.camera_intention="camera behavior supports the performer’s rhythm without inventing choreography";
    result.visual_priority_flow="full-body motion first, rhythm second, camera engagement third";
  } else if(beautyFashion) {
    result.primary_visual_focus="facial expression and portrait posing";
    result.secondary_visual_focus=/hair|outfit|dress|sari|saree|jewelry|clothing/.test(text)
      ? "hair movement and outfit detail"
      : "expression detail and portrait movement";
    result.attention_progression="attention stays centered on eye contact before shifting naturally toward expressive posing";
    result.focus_transition="the framing gradually emphasizes movement and expression";
    result.camera_intention="camera behavior supports portrait presence and viewer connection";
    result.visual_priority_flow="face first, expression second, movement third";
  } else if(food) {
    result.primary_visual_focus=/pour|spread|gloss|texture/.test(text) ? "food texture and preparation motion" : "food texture and ingredient detail";
    result.secondary_visual_focus="ingredient detail and surface gloss";
    result.attention_progression="attention follows the texture movement through the preparation process";
    result.focus_transition="visual emphasis moves from the food surface toward satisfying detail";
    result.camera_intention="camera behavior supports close food texture and preparation clarity";
    result.visual_priority_flow="texture first, motion second, ingredient detail third";
  } else if(product) {
    result.primary_visual_focus="product branding and creator interaction";
    result.secondary_visual_focus="surface texture and packaging detail";
    result.attention_progression="attention remains centered on the hero product before moving toward packaging detail";
    result.focus_transition="the framing gradually emphasizes label clarity and product surface detail";
    result.camera_intention="camera behavior supports hero-product emphasis";
    result.visual_priority_flow="product first, branding second, texture third";
  } else if(talking) {
    result.primary_visual_focus="presenter face and direct-to-camera delivery";
    result.secondary_visual_focus="hand gestures and explanatory body language";
    result.attention_progression="attention remains on the presenter while gestures support the explanation";
    result.focus_transition="visual emphasis stays anchored to the speaker’s face and delivery";
    result.camera_intention="camera behavior supports audience-facing explanation";
    result.visual_priority_flow="face first, speech delivery second, gestures third";
  }
  console.log("[attention direction intelligence]");
  console.log(JSON.stringify(result,null,2));
  return result;
}

function semanticSceneContext(factual) {
  return {
    scene_purpose:cleanFact(factual?.scene_purpose),
    activity_context:cleanFact(factual?.activity_context),
    content_theme:cleanFact(factual?.content_theme),
    audience_intent:cleanFact(factual?.audience_intent),
  };
}

function reelTypeContext(factual) {
  const reelType=cleanFact(factual?.reel_type)||"other";
  return {reel_type:reelType};
}

function objectContext(factual) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const ctx={
    primary_object:cleanFact(factual?.primary_object),
    hero_element:cleanFact(factual?.hero_element),
    product_identity:cleanFact(factual?.product_identity),
  };
  if(contentType==="food") ctx.food_focus=cleanFact(factual?.food_focus);
  return ctx;
}

function confidenceContext(factual) {
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  return {
    product_identity:clamp(factual?.confidence_product_identity),
    reel_type:clamp(factual?.confidence_reel_type),
    semantic_scene:clamp(factual?.confidence_semantic_scene),
  };
}

function screenContext(factual) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  if(!["screen_recording","ui_screenshot"].includes(contentType)) {
    return {screen_context:"",interaction_type:"",workflow_stage:""};
  }
  return {
    screen_context:cleanFact(factual?.screen_context),
    interaction_type:cleanFact(factual?.interaction_type),
    workflow_stage:cleanFact(factual?.workflow_stage),
  };
}

function workflowDomainContext(factual) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  if(!["screen_recording","ui_screenshot"].includes(contentType)) {
    return {workflow_domain:"",confidence:0};
  }
  return {
    workflow_domain:cleanFact(factual?.workflow_domain),
    confidence:Math.max(0,Math.min(1,Number(factual?.confidence_workflow_domain)||0)),
  };
}

function loadPromptProfile(platform) {
  const key=String(platform||"").trim().toLowerCase();
  const fileMap={runway:"runway.json",sora:"sora.json",kling:"kling.json",veo:"veo.json",pika:"pika.json"};
  const fileName=fileMap[key];
  if(!fileName) return null;
  if(promptProfileCache.has(key)) return promptProfileCache.get(key);
  const profilePath=path.join(__dirname,"prompt_profiles",fileName);
  try{
    const profile=JSON.parse(fs.readFileSync(profilePath,"utf8"));
    promptProfileCache.set(key,profile);
    console.log("[prompt profile loaded]");
    console.log(JSON.stringify({
      platform:key,
      source:profile.source||profilePath,
      structure:profile.preferred_structure||[],
      idealLength:profile.ideal_length||{},
    },null,2));
    return profile;
  }catch(e){
    console.error("[prompt profile load failed]",{platform:key,path:profilePath,error:e.message});
    return null;
  }
}

function loadReferencePattern(platform) {
  const key=String(platform||"").trim().toLowerCase();
  const fileMap={runway:"runway.json",sora:"sora.json",kling:"kling.json",veo:"veo.json",pika:"pika.json"};
  const fileName=fileMap[key];
  if(!fileName) return null;
  if(referencePatternCache.has(key)) return referencePatternCache.get(key);
  const patternPath=path.join(__dirname,"reference_patterns",fileName);
  try{
    const pattern=JSON.parse(fs.readFileSync(patternPath,"utf8"));
    const loaded={...pattern,patternFile:patternPath};
    referencePatternCache.set(key,loaded);
    return loaded;
  }catch(e){
    console.error("[reference pattern load failed]",{platform:key,path:patternPath,error:e.message});
    return null;
  }
}

function getPlatformGenerationProfile(platform) {
  const promptProfile=loadPromptProfile(platform);
  if(!promptProfile) return {
    verbosity:"medium",
    camera_focus:false,
    motion_focus:true,
    semantic_focus:false,
    temporal_focus:false,
    commercial_focus:false,
    workflow_focus:false,
  };
  const scores=promptProfile.emphasis_scores||{};
  const maxWords=Number(promptProfile.ideal_length?.maximum_words)||0;
  return {
    verbosity:maxWords>180 ? "high" : maxWords>120 ? "medium" : "low",
    camera_focus:(Number(scores.camera)||0)>=4,
    motion_focus:(Number(scores.motion)||0)>=4,
    semantic_focus:(Number(scores.environment)||0)>=4||(Number(scores.atmosphere)||0)>=4,
    temporal_focus:(Number(scores.temporal)||0)>=5||(Number(scores.continuity)||0)>=5,
    commercial_focus:false,
    workflow_focus:false,
    emphasis_scores:scores,
    ideal_length:promptProfile.ideal_length||{},
  };
}

function buildPlatformPromptTemplate(platform, factual, profile, context) {
  const promptProfile=loadPromptProfile(platform);
  const contentType=cleanFact(factual?.content_type)||"other";
  const objectFocus=cleanFact(context?.objectContext?.hero_element)||cleanFact(context?.objectContext?.primary_object)||"grounded subject or object";
  const environmentFocus=cleanFact(factual?.environment)||"visible environment";
  const motionFocus=context?.motionUnknown ? "static composition or grounded micro-motion only" : "grounded visible motion";
  const workflowFocus=context?.workflowDomainApplied
    ? `workflow context: ${cleanFact(context?.workflowDomain?.workflow_domain)||"visible software workflow"}`
    : "no workflow emphasis";
  const semanticFocus=context?.semanticApplied
    ? `scene purpose: ${cleanFact(context?.semanticContext?.scene_purpose)||cleanFact(context?.semanticContext?.activity_context)||"grounded scene context"}`
    : "minimal semantic explanation";
  const writingStyle=promptProfile?.writing_style||{};
  const template=promptProfile ? {
    order:promptProfile.preferred_structure||[],
    style:[...(writingStyle.tone||[]),...(writingStyle.preferred_wording||[])].filter(Boolean).join("; "),
    structure:promptProfile.example_template||"Use grounded facts in profile order.",
    emphasis:Object.entries(promptProfile.emphasis_scores||{}).sort((a,b)=>b[1]-a[1]).map(([name,score])=>`${name}:${score}`),
    avoid:promptProfile.avoid||[],
    writing_rules:[
      ...(writingStyle.sentence_structure||[]),
      ...(writingStyle.preferred_wording||[]),
      ...(writingStyle.level_of_detail||[]),
    ],
  } : {
    order:["grounded subject/object","composition","lighting","motion"],
    style:"grounded visual prompt",
    structure:"Use grounded facts in a clear order.",
    emphasis:["factual specificity"],
    avoid:["invented details"],
    writing_rules:[],
  };
  return {
    platform,
    source:promptProfile?.source||"",
    verbosity:profile?.verbosity||"medium",
    content_type:contentType,
    order:template.order,
    style:template.style,
    structure:template.structure,
    emphasis:template.emphasis,
    avoid:template.avoid,
    writing_rules:template.writing_rules||[],
    context_use:{
      object_focus:objectFocus,
      environment_focus:environmentFocus,
      motion_focus:motionFocus,
      semantic_focus:profile?.semantic_focus ? semanticFocus : "reduce semantic language",
      workflow_focus:profile?.workflow_focus ? workflowFocus : "exclude workflow emphasis",
      commercial_focus:profile?.commercial_focus ? "allow grounded commercial emphasis" : "avoid commercial framing unless directly visual",
      temporal_focus:profile?.temporal_focus ? "allow grounded continuity and progression" : "avoid extended temporal progression",
    },
  };
}

function buildDirectorPrompt(platform, factual, profile, template) {
  const cleanList=items=>items.map(cleanFact).filter(usableFact);
  const subject=cleanFact(factual?.subjects)||cleanFact(factual?.primary_object)||cleanFact(factual?.hero_element)||"grounded subject or object";
  const objectFocus=cleanFact(factual?.hero_element)||cleanFact(factual?.primary_object)||cleanFact(factual?.product_identity)||cleanFact(factual?.food_focus);
  const action=cleanFact(factual?.subject_motion)||cleanFact(factual?.visible_motion_cues)||cleanFact(factual?.pose_action)||"grounded visible action or stillness";
  const supplemental=cleanFact(template?.context_use?.motion_focus);
  const camera=cleanFact(factual?.camera_motion)||cleanFact(template?.context_use?.motion_focus)||"grounded camera behavior";
  const environment=cleanFact(factual?.environment)||cleanFact(factual?.surfaces)||"visible environment";
  const lighting=cleanFact(factual?.lighting)||"visible lighting";
  const atmosphere=cleanFact(factual?.mood_atmosphere)||cleanFact(factual?.scene_purpose)||"grounded atmosphere";
  const visualFinish=cleanList([
    cleanFact(factual?.lens_feel),
    cleanFact(factual?.color_palette),
    lighting,
  ]).join("; ")||"grounded visual finish";
  const base={
    platform,
    subject,
    object_focus:objectFocus,
    visible_motion_first:action,
    supplemental_motion_second:supplemental,
    camera_direction:camera,
    environment_response:environment,
    lighting_behavior:lighting,
    visual_finish:visualFinish,
    active_language:["focus settles on","camera follows","subject gradually","attention shifts","environment responds","motion unfolds","framing isolates"],
    avoid_repetitive_words:["captures","shows","depicts","features","contains"],
    rule:"Write generation-oriented shot direction. Describe what the viewer sees, how motion unfolds, how the camera behaves, and how attention is directed. Use each avoid_repetitive_words term no more than once.",
  };
  const platformKey=String(platform||"").toLowerCase();
  if(platformKey==="runway") {
    return {
      ...base,
      style:"concise production shot direction",
      structure:["shot type","subject","action","camera behavior","environment"],
      composition:"Start with shot type. Name the grounded subject. Describe visible action. Direct camera behavior as an instruction. End with grounded environment and lighting response.",
    };
  }
  if(platformKey==="veo") {
    return {
      ...base,
      style:"cinematic prose",
      structure:["atmosphere","subject","motion progression","camera","visual finish"],
      composition:"Begin with atmosphere and lighting. Blend the subject into grounded motion progression. Use camera behavior as natural prose, then close with material response and visual finish.",
    };
  }
  if(platformKey==="sora") {
    return {
      ...base,
      style:"continuous temporal scene direction",
      structure:["scene setup","temporal progression","motion continuity","environment"],
      composition:"Set up the scene, then describe grounded continuity using initially, gradually, as the moment unfolds, or while only when supported. Keep environment connected to motion.",
    };
  }
  if(platformKey==="kling") {
    return {
      ...base,
      style:"explicit composition and motion direction",
      structure:["framing","motion","composition","visual detail"],
      composition:"Open with framing. State visible motion explicitly. Use composition language to keep attention on the subject or object. Finish with concrete visual detail.",
    };
  }
  if(platformKey==="pika") {
    return {
      ...base,
      style:"compact visual direction",
      structure:["subject","motion","camera","environment"],
      composition:"Write 40-70 words. Lead with subject or object, then visible motion, camera direction, and environment. Keep it compact and direct.",
    };
  }
  return {
    ...base,
    style:"grounded shot direction",
    structure:template?.order||["subject","motion","camera","environment"],
    composition:"Use grounded facts as shot direction.",
  };
}

function isStaticPortraitWithoutMotion(factual) {
  const subjectMotion=cleanFact(factual?.subject_motion).toLowerCase();
  const visibleMotion=cleanFact(factual?.visible_motion_cues).toLowerCase();
  const cameraMotion=cleanFact(factual?.camera_motion).toLowerCase();
  return subjectMotion==="none visible"&&visibleMotion==="none visible"&&/^(static|locked-off|locked off)$/.test(cameraMotion);
}

function isUnboxingContent(factual) {
  const text=[
    cleanFact(factual?.overlay_text),
    cleanFact(factual?.overlay_topic),
    cleanFact(factual?.scene_purpose),
    cleanFact(factual?.activity_context),
    cleanFact(factual?.pose_action),
    cleanFact(factual?.primary_object),
    cleanFact(factual?.secondary_objects),
    cleanFact(factual?.hero_element),
    cleanFact(factual?.product_identity),
  ].join(" ").toLowerCase();
  return /\b(unbox|unboxing|pr kit|package opening|package|packaging|box|parcel|container|branded package)\b/.test(text)&&
    /\b(hand|hands|open|opening|holding|interacting|present|presenting|package|packaging|box|container|product)\b/.test(text);
}

function creatorProductOpening(factual) {
  const heroElement=cleanFact(factual?.hero_element);
  const primaryObject=cleanFact(factual?.primary_object);
  const productIdentity=cleanFact(factual?.product_identity);
  const subject=cleanFact(factual?.subjects);
  const pose=cleanFact(factual?.pose_action);
  const product=heroElement||primaryObject||productIdentity;
  if(!product) return "";
  const hands=/\bhand|hands|holding|opening|unbox|package|box\b/i.test([pose,product].join(" "));
  const creator=/\bcreator|person|woman|man|female|male|subject|hand|hands\b/i.test([subject,pose].join(" "))
    ? (hands ? "Hands" : "Creator")
    : "Creator";
  if(isUnboxingContent(factual)) return `${creator} opening and presenting ${product}`;
  if(hands||/\bholding|hold\b/i.test(pose)) return `${creator} holding ${product}`;
  return `${product} presented as the hero object`;
}

function buildActionAbstraction(factual) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const reelType=cleanFact(factual?.reel_type).toLowerCase();
  const speechPresent=factual?.speech_present===true || String(factual?.speech_present).trim().toLowerCase()==="true";
  const originalMotion=[
    cleanFact(factual?.subject_motion),
    cleanFact(factual?.visible_motion_cues),
    cleanFact(factual?.inferred_motion),
    cleanFact(factual?.pose_action),
  ].filter(usableFact).join("; ");
  const motionText=originalMotion.toLowerCase();
  let primaryAction=cleanFact(factual?.subject_motion)||cleanFact(factual?.visible_motion_cues)||cleanFact(factual?.pose_action)||"composed stillness holds the frame";
  let interaction="";
  if(isStaticPortraitWithoutMotion(factual)) {
    const result={
      primary_action_description:"",
      interaction_description:"",
    };
    console.log("[static portrait guard]");
    console.log(JSON.stringify({
      triggered:true,
      removedAction:true,
      removedMicroMotion:false,
    },null,2));
    console.log("[action abstraction]");
    console.log(JSON.stringify({
      originalMotion,
      abstractedAction:result,
    },null,2));
    return result;
  }

  if(speechPresent&&reelType==="educational_talking_head") {
    if(/\bmouth|speaking|talking|opens?|opening|gestures?|pointing|hand|hands\b/.test(motionText)) {
      primaryAction="presenter speaking directly to camera";
      interaction=/\bpoint|gesture|hand|hands\b/.test(motionText)
        ? "presenter emphasizing a key point"
        : "presenter explaining information";
    }
  } else if(["lifestyle_portrait","fashion_portrait","beauty_portrait"].includes(reelType)) {
    if(/\bhead|turn|turns|turning|expression|smile|gaze|eyes|face\b/.test(motionText)) {
      primaryAction=/\bexpression|smile|face|eyes\b/.test(motionText)
        ? "natural expression change"
        : "subtle pose adjustment";
      interaction="portrait motion remains restrained and natural";
    }
  } else if(contentType==="product"||reelType==="product_showcase"||reelType==="product_review") {
    if(isUnboxingContent(factual)) {
      primaryAction="opening and presenting the product";
      interaction="attention moves from packaging to product details";
    } else if(/\bfocus|breathing|minor|object|product|label|packaging|highlight\b/.test(motionText)) {
      primaryAction="commercial product presentation";
      interaction="attention moves toward product details";
    }
  } else if(contentType==="food"||reelType==="food_content") {
    if(/\btexture|ingredient|spread|pour|mix|food|bread|topping|surface\b/.test(motionText)) {
      primaryAction=/\bprepar|apply|spread|pour|mix\b/.test(motionText)
        ? "food preparation"
        : "food presentation";
      interaction="attention emphasizes edible texture and ingredients";
    }
  }

  const result={
    primary_action_description:primaryAction,
    interaction_description:interaction,
  };
  console.log("[action abstraction]");
  console.log(JSON.stringify({
    originalMotion,
    abstractedAction:result,
  },null,2));
  return result;
}

function buildShotPlan(factual, cameraGrammar, microMotion) {
  const heroElement=cleanFact(factual?.hero_element);
  const primaryObject=cleanFact(factual?.primary_object);
  const productIdentity=cleanFact(factual?.product_identity);
  const hasProductPriority=cleanFact(factual?.content_type).toLowerCase()==="product"||usableFact(productIdentity)||usableFact(heroElement);
  const subject=cleanFact(factual?.subjects)||cleanFact(factual?.primary_object)||cleanFact(factual?.hero_element)||cleanFact(factual?.product_identity)||cleanFact(factual?.food_focus)||"visible subject or object";
  const environment=cleanFact(factual?.environment)||cleanFact(factual?.surfaces)||"visible environment";
  const prioritizedOpening=hasProductPriority ? creatorProductOpening(factual) : "";
  const openingVisual=prioritizedOpening||[subject,environment].filter(usableFact).join(" in ")||subject;
  const actionAbstraction=buildActionAbstraction(factual);
  const staticPortrait=isStaticPortraitWithoutMotion(factual);
  const primaryAction=staticPortrait ? "" : (cleanFact(actionAbstraction.primary_action_description)||cleanFact(factual?.subject_motion)||cleanFact(factual?.visible_motion_cues)||cleanFact(factual?.pose_action)||"composed stillness holds the frame");
  const secondaryMotion=microMotion?.applied
    ? [cleanFact(actionAbstraction.interaction_description),cleanFact(microMotion.generated_layer)].filter(usableFact).join("; ")
    : (staticPortrait ? "" : cleanFact(factual?.environmental_motion)||"no supplemental motion");
  const rawCamera=cleanFact(factual?.camera_motion);
  const cameraStatic=/^(static|none|none visible|not visible|not enough evidence|locked-off|locked off|)$/i.test(rawCamera);
  const cameraBehavior=cameraStatic
    ? "Static camera with locked-off framing"
    : cleanFact(cameraGrammar?.cameraMotion)||`Camera follows ${rawCamera}`;
  const environmentMotion=cleanFact(factual?.environmental_motion);
  const environmentResponse=usableFact(environmentMotion)&&!/^(none|none visible|not visible|not enough evidence|static)$/i.test(environmentMotion)
    ? environmentMotion
    : (hasProductPriority ? cleanFact(factual?.lighting)||"background remains secondary to the product" : cleanFact(factual?.environment)||"visible environment remains grounded");
  const finishParts=[
    cleanFact(factual?.lens_feel),
    cleanFact(factual?.lighting),
    cleanFact(factual?.mood_atmosphere),
  ].filter(usableFact);
  const plan={
    opening_visual:openingVisual,
    primary_action:primaryAction,
    secondary_motion:secondaryMotion,
    camera_behavior:cameraBehavior,
    environment_response:environmentResponse,
    visual_finish:finishParts.join("; ")||"grounded lens feel and atmosphere",
  };
  console.log("[subject priority]");
  console.log(JSON.stringify({
    primaryObject,
    heroElement,
    productIdentity,
    prioritized:hasProductPriority,
  },null,2));
  return plan;
}

function buildDirectorBrief(factual, cameraGrammar, microMotion, shotPlan) {
  const speechPresent=factual?.speech_present===true || String(factual?.speech_present).trim().toLowerCase()==="true";
  const speechConfidence=Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0));
  const speechLanguage=cleanFact(factual?.speech_language);
  const spokenTopic=cleanFact(factual?.spoken_topic);
  const audioType=cleanFact(factual?.audio_type)||"none";
  const audioRole=cleanFact(factual?.audio_role);
  const dialogueSummary=cleanFact(factual?.dialogue_summary);
  const musicMood=cleanFact(factual?.music_mood);
  const ambientAudio=cleanFact(factual?.ambient_audio);
  const reelEnergy=[
    cleanFact(factual?.reel_energy),
    cleanFact(factual?.performance_style),
    cleanFact(factual?.social_aesthetic),
    cleanFact(factual?.motion_style),
    cleanFact(factual?.viewer_feeling),
    cleanFact(factual?.camera_presence),
    cleanFact(factual?.music_sync_energy),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.movement_density),
    cleanFact(factual?.motion_rhythm),
    cleanFact(factual?.body_motion_style),
    cleanFact(factual?.beat_sync_strength),
    cleanFact(factual?.performance_intensity),
    cleanFact(factual?.camera_engagement),
    cleanFact(factual?.movement_continuity),
    cleanFact(factual?.motion_focus),
    cleanFact(factual?.creator_archetype),
    cleanFact(factual?.creator_presence),
    cleanFact(factual?.content_personality),
    cleanFact(factual?.social_platform_style),
    cleanFact(factual?.presentation_style),
    cleanFact(factual?.viewer_relationship),
    cleanFact(factual?.temporal_opening),
    cleanFact(factual?.temporal_progression),
    cleanFact(factual?.temporal_continuity),
    cleanFact(factual?.moment_flow),
    cleanFact(factual?.scene_evolution),
    cleanFact(factual?.performance_progression),
    cleanFact(factual?.primary_visual_focus),
    cleanFact(factual?.secondary_visual_focus),
    cleanFact(factual?.attention_progression),
    cleanFact(factual?.focus_transition),
    cleanFact(factual?.camera_intention),
    cleanFact(factual?.visual_priority_flow),
  ].filter(usableFact).join("; ");
  const overlayTopic=cleanFact(factual?.overlay_topic);
  const semantic=[
    cleanFact(factual?.scene_purpose),
    cleanFact(factual?.activity_context),
    cleanFact(factual?.content_theme),
  ].filter(usableFact).join("; ");
  const actionAbstraction=buildActionAbstraction(factual);
  const staticPortrait=isStaticPortraitWithoutMotion(factual);
  const dialogue=["speech","speech_and_music"].includes(audioType)
    ? [speechLanguage ? `${speechLanguage} speech` : "", dialogueSummary||spokenTopic].filter(usableFact).join("; ")
    : "";
  const audio=audioType==="speech"
    ? [audioRole||"speaking guidance",dialogue].filter(usableFact).join("; ")
    : audioType==="music"
      ? [musicMood||"background music","no dialogue guidance"].filter(usableFact).join("; ")
      : audioType==="speech_and_music"
        ? [audioRole||"speaking guidance with background music",dialogue,musicMood].filter(usableFact).join("; ")
        : audioType==="ambient_audio"
          ? [ambientAudio||"ambient audio","no dialogue guidance"].filter(usableFact).join("; ")
          : "";
  const subject=rewriteSlotLanguage(
    cleanFact(factual?.creator_archetype)||
    cleanFact(factual?.hero_element)||
    cleanFact(factual?.primary_object)||
    cleanFact(factual?.product_identity)||
    cleanFact(factual?.food_focus)||
    cleanFact(factual?.subjects)||
    cleanFact(shotPlan?.opening_visual),
    factual
  );
  const scene=cleanFact(semantic)||cleanFact(factual?.reel_type)||cleanFact(factual?.content_type);
  const action=staticPortrait ? "" : rewriteSlotLanguage(
    cleanFact(actionAbstraction.primary_action_description)||
    cleanFact(shotPlan?.primary_action)||
    cleanFact(factual?.pose_action),
    factual
  );
  const camera=cleanFact(shotPlan?.camera_behavior)||cleanFact(cameraGrammar?.cameraMotion)||cleanFact(factual?.camera_motion);
  const lighting=cleanFact(factual?.lighting);
  const environment=cleanFact(shotPlan?.environment_response)||cleanFact(factual?.environment)||cleanFact(factual?.surfaces);
  const mood=cleanFact(factual?.mood_atmosphere)||cleanFact(factual?.audience_intent);
  const motion=staticPortrait ? "" : [
    cleanFact(factual?.subject_motion),
    cleanFact(factual?.visible_motion_cues),
    cleanFact(factual?.environmental_motion),
    cleanFact(factual?.motion_style),
    cleanFact(factual?.music_sync_energy),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.movement_density),
    cleanFact(factual?.motion_rhythm),
    cleanFact(factual?.body_motion_style),
    cleanFact(factual?.beat_sync_strength),
    cleanFact(factual?.movement_continuity),
    cleanFact(factual?.motion_focus),
    cleanFact(factual?.temporal_progression),
    cleanFact(factual?.temporal_continuity),
    cleanFact(factual?.moment_flow),
    cleanFact(factual?.performance_progression),
    cleanFact(factual?.attention_progression),
    cleanFact(factual?.focus_transition),
    cleanFact(microMotion?.generated_layer),
  ].filter(usableFact).join("; ");
  const visualGoal=[
    cleanFact(factual?.reel_energy),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.creator_archetype),
    cleanFact(factual?.social_aesthetic),
    cleanFact(factual?.social_platform_style),
    cleanFact(factual?.hero_element),
    cleanFact(factual?.primary_object),
    cleanFact(factual?.product_identity),
    cleanFact(overlayTopic),
  ].filter(usableFact).slice(0,2).join("; ") || cleanFact(shotPlan?.visual_finish);
  const generationIntent=[
    cleanFact(factual?.reel_energy),
    cleanFact(factual?.dance_energy),
    cleanFact(factual?.creator_archetype),
    cleanFact(factual?.performance_style),
    cleanFact(factual?.presentation_style),
    cleanFact(factual?.performance_intensity),
    cleanFact(factual?.temporal_opening),
    cleanFact(factual?.temporal_progression),
    cleanFact(factual?.primary_visual_focus),
    cleanFact(factual?.attention_progression),
    cleanFact(factual?.reel_type),
    cleanFact(factual?.audience_intent),
    cleanFact(factual?.workflow_domain),
  ].filter(usableFact).join("; ") || "grounded video generation shot direction";
  const brief={
    subject,
    scene:rewriteSlotLanguage(scene,factual),
    action,
    camera:rewriteSlotLanguage(camera,factual),
    lighting:rewriteSlotLanguage(lighting,factual),
    environment:rewriteSlotLanguage(environment,factual),
    mood:rewriteSlotLanguage(mood,factual),
    motion:rewriteSlotLanguage(motion,factual),
    reel_energy:rewriteSlotLanguage(reelEnergy,factual),
    performance_style:rewriteSlotLanguage(factual?.performance_style,factual),
    social_aesthetic:rewriteSlotLanguage(factual?.social_aesthetic,factual),
    motion_style:rewriteSlotLanguage(factual?.motion_style,factual),
    viewer_feeling:rewriteSlotLanguage(factual?.viewer_feeling,factual),
    camera_presence:rewriteSlotLanguage(factual?.camera_presence,factual),
    music_sync_energy:rewriteSlotLanguage(factual?.music_sync_energy,factual),
    dance_energy:rewriteSlotLanguage(factual?.dance_energy,factual),
    movement_density:rewriteSlotLanguage(factual?.movement_density,factual),
    motion_rhythm:rewriteSlotLanguage(factual?.motion_rhythm,factual),
    body_motion_style:rewriteSlotLanguage(factual?.body_motion_style,factual),
    beat_sync_strength:rewriteSlotLanguage(factual?.beat_sync_strength,factual),
    performance_intensity:rewriteSlotLanguage(factual?.performance_intensity,factual),
    camera_engagement:rewriteSlotLanguage(factual?.camera_engagement,factual),
    movement_continuity:rewriteSlotLanguage(factual?.movement_continuity,factual),
    motion_focus:rewriteSlotLanguage(factual?.motion_focus,factual),
    creator_archetype:rewriteSlotLanguage(factual?.creator_archetype,factual),
    creator_presence:rewriteSlotLanguage(factual?.creator_presence,factual),
    content_personality:rewriteSlotLanguage(factual?.content_personality,factual),
    social_platform_style:rewriteSlotLanguage(factual?.social_platform_style,factual),
    presentation_style:rewriteSlotLanguage(factual?.presentation_style,factual),
    viewer_relationship:rewriteSlotLanguage(factual?.viewer_relationship,factual),
    temporal_opening:rewriteSlotLanguage(factual?.temporal_opening,factual),
    temporal_progression:rewriteSlotLanguage(factual?.temporal_progression,factual),
    temporal_continuity:rewriteSlotLanguage(factual?.temporal_continuity,factual),
    moment_flow:rewriteSlotLanguage(factual?.moment_flow,factual),
    scene_evolution:rewriteSlotLanguage(factual?.scene_evolution,factual),
    performance_progression:rewriteSlotLanguage(factual?.performance_progression,factual),
    primary_visual_focus:rewriteSlotLanguage(factual?.primary_visual_focus,factual),
    secondary_visual_focus:rewriteSlotLanguage(factual?.secondary_visual_focus,factual),
    attention_progression:rewriteSlotLanguage(factual?.attention_progression,factual),
    focus_transition:rewriteSlotLanguage(factual?.focus_transition,factual),
    camera_intention:rewriteSlotLanguage(factual?.camera_intention,factual),
    visual_priority_flow:rewriteSlotLanguage(factual?.visual_priority_flow,factual),
    dialogue,
    audio,
    audio_type:audioType,
    audio_role:audioRole,
    dialogue_summary:dialogueSummary,
    music_mood:musicMood,
    ambient_audio:ambientAudio,
    visual_goal:rewriteSlotLanguage(visualGoal,factual),
    generation_intent:rewriteSlotLanguage(generationIntent,factual),
  };
  for(const key of Object.keys(brief)) {
    if(!usableFact(brief[key])) brief[key]="";
  }
  console.log("[director brief]");
  console.log(JSON.stringify(brief,null,2));
  return brief;
}

function cleanMasterPromptText(text) {
  return String(text||"")
    .replace(/\b(shows|depicts|contains|captures)\b/gi,"presents")
    .replace(/\s+/g," ")
    .trim();
}

function trimPromptWords(text, maxWords=120) {
  const words=String(text||"").trim().split(/\s+/).filter(Boolean);
  if(words.length<=maxWords) return text.trim();
  return `${words.slice(0,maxWords).join(" ").replace(/[,.]$/,"")}.`;
}

function buildAudioPromptGuidance(platform, brief={}) {
  const platformKey=String(platform||"").toLowerCase();
  const audioType=cleanFact(brief?.audio_type)||"none";
  const language=cleanFact(brief?.dialogue).match(/\b([A-Z][a-z]+) speech\b/)?.[1]||"";
  const dialogueSummary=cleanFact(brief?.dialogue_summary);
  const musicMood=cleanFact(brief?.music_mood);
  const ambientAudio=cleanFact(brief?.ambient_audio);
  const strong=["veo","master"].includes(platformKey);
  const moderate=platformKey==="sora";
  let guidance="";
  if(audioType==="speech") {
    guidance=strong
      ? `The speaker talks directly to the camera${language ? ` in ${language}` : ""}${dialogueSummary ? `, ${dialogueSummary}` : ""}.`
      : moderate
        ? `Include concise speaking guidance${dialogueSummary ? `: ${dialogueSummary}` : ""}.`
        : `Minimal speech guidance${dialogueSummary ? `: ${dialogueSummary}` : ""}.`;
  } else if(audioType==="music") {
    guidance=strong
      ? `Background ${musicMood||"music"} supports the scene; do not add dialogue.`
      : moderate
        ? `Use ${musicMood||"background music"} as light audio context.`
        : `${musicMood||"background music"}.`;
  } else if(audioType==="speech_and_music") {
    guidance=strong
      ? `The speaker talks directly to the camera${language ? ` in ${language}` : ""}${dialogueSummary ? `, ${dialogueSummary}` : ""}, with ${musicMood||"background music"} underneath.`
      : moderate
        ? `Include speech context${dialogueSummary ? `: ${dialogueSummary}` : ""} with ${musicMood||"background music"}.`
        : `Speech plus ${musicMood||"background music"}.`;
  } else if(audioType==="ambient_audio") {
    guidance=strong
      ? `Use ${ambientAudio||"ambient sound"} as grounded environmental audio.`
      : moderate
        ? `${ambientAudio||"ambient sound"} supports the scene.`
        : `${ambientAudio||"ambient sound"}.`;
  }
  return guidance.trim();
}

function normalizePromptSentences(text) {
  return String(text||"")
    .replace(/\s+/g," ")
    .replace(/\s+([,.!?;:])/g,"$1")
    .replace(/([.!?])(?=\S)/g,"$1 ")
    .trim();
}

function applyCinematicPhraseReplacements(prompt) {
  return normalizePromptSentences(prompt)
    .replace(/\bStatic camera framing keeps the face visible\b/gi,"Static portrait framing centers the presenter naturally within the shot")
    .replace(/\bStatic camera framing keeps ([^.]+?) visible\b/gi,"Static framing holds $1 clearly within the shot")
    .replace(/\bstatic camera framing keeps ([^.]+?) visible\b/gi,"static framing holds $1 clearly within the shot")
    .replace(/\bkeeps attention on\b/gi,"draws the eye to")
    .replace(/\bmotion remains restrained and grounded\b/gi,"subtle natural movement maintains a realistic presence")
    .replace(/\bMotion remains restrained and grounded\b/gi,"Subtle natural movement maintains a realistic presence")
    .replace(/\bremains grounded\b/gi,"stays realistic")
    .replace(/\bSet the scene in\b/gi,"The scene unfolds inside")
    .replace(/\bset the scene in\b/gi,"the scene unfolds inside")
    .replace(/\bdirect attention toward\b/gi,"lets the eye settle on")
    .replace(/\bDirect attention toward\b/gi,"Let the eye settle on")
    .replace(/\benvironment remains visible\b/gi,"the surrounding space stays present")
    .replace(/\bEnvironment remains visible\b/gi,"The surrounding space stays present")
    .replace(/\bUse subject-first wording, explicit camera framing, practical lighting detail, grounded environment context, realistic motion, and a concise final style direction\./gi,"Keep the image subject-first, with clear framing, practical light, visible surroundings, and realistic motion.")
    .replace(/\bFrame with static camera with\b/gi,"Static camera with")
    .replace(/\bFrame with\b/gi,"Frame the shot with")
    .replace(/\bLighting shapes the subject and keeps details readable\b/gi,"Lighting shapes the subject with clear, readable detail")
    .replace(/\bgrounded, generation-oriented video prompt with clear visual intent\b/gi,"natural cinematic realism with clear visual intent")
    .replace(/\bMinimal speech guidance:/gi,"Speech:")
    .replace(/\bInclude concise speaking guidance:/gi,"Speech:")
    .replace(/\bUse ([^.]+?) as light audio context\b/gi,"$1 sits lightly under the scene");
}

function platformLanguageStyle(platform, prompt) {
  const key=String(platform||"").toLowerCase();
  let text=normalizePromptSentences(prompt);
  if(key==="veo") {
    text=text
      .replace(/\bCamera frames the shot with\b/gi,"The camera frames the moment with")
      .replace(/\bAction unfolds as\b/gi,"The motion unfolds as")
      .replace(/\bMaintain\b/gi,"The atmosphere holds");
  } else if(key==="sora") {
    text=text
      .replace(/\bThe scene unfolds inside\b/gi,"As the moment opens inside")
      .replace(/\bThe camera frames\b/gi,"As the shot develops, the camera frames")
      .replace(/\bThe subject\b/gi,"Gradually, the subject");
  } else if(key==="runway") {
    text=text
      .replace(/\bThe scene unfolds inside\b/gi,"Location:")
      .replace(/\bThe camera frames the moment with\b/gi,"Camera:")
      .replace(/\bLighting shapes\b/gi,"Lighting:")
      .replace(/\bThe atmosphere holds\b/gi,"Tone:");
  } else if(key==="kling") {
    text=text
      .replace(/\bSubtle natural movement maintains a realistic presence\b/gi,"Small visible movements preserve a lifelike performance")
      .replace(/\bStatic framing holds\b/gi,"Locked-off composition clearly defines");
  } else if(key==="pika") {
    text=text
      .replace(/\bThe scene unfolds inside\b/gi,"Scene:")
      .replace(/\bStatic portrait framing centers\b/gi,"Static portrait framing:")
      .replace(/\bSubtle natural movement maintains a realistic presence\b/gi,"Subtle realistic motion")
      .replace(/\bLighting shapes the subject with clear, readable detail\b/gi,"Readable practical lighting");
    text=trimPromptWords(text,90);
  } else if(key==="master") {
    text=text
      .replace(/\bThe scene unfolds inside\b/gi,"The scene unfolds in")
      .replace(/\bFrame the shot with\b/gi,"Use")
      .replace(/\bStyle:\s*/gi,"Finish with ");
  }
  return normalizePromptSentences(text);
}

function alignSentenceRhythm(platform, prompt, pattern) {
  const key=String(platform||"").toLowerCase();
  let text=normalizePromptSentences(prompt);
  const avgWords=Number(pattern?.avgWords)||0;
  if(key==="pika"&&wordCount(text)>90) return trimPromptWords(text,90);
  if(["veo","sora"].includes(key)&&avgWords>=90&&wordCount(text)<55) {
    return normalizePromptSentences(`${text} Let the visual rhythm stay cinematic and continuous without adding new actions or objects.`);
  }
  if(key==="runway"&&wordCount(text)>120) return trimPromptWords(text,120);
  return text;
}

function refinePromptLanguage(platform, prompt, profile) {
  const before=String(prompt||"").trim();
  const key=String(platform||"").toLowerCase();
  if(!before) return before;
  const pattern=["runway","sora","kling","veo","pika"].includes(key) ? loadReferencePattern(key) : null;
  let refined=applyCinematicPhraseReplacements(before);
  refined=platformLanguageStyle(key,refined);
  refined=alignSentenceRhythm(key,refined,pattern);
  refined=normalizePromptSentences(refined);
  const improved=refined!==before;
  console.log("[language refinement]");
  console.log(JSON.stringify({
    platform:key||platform,
    improved,
    beforeWords:wordCount(before),
    afterWords:wordCount(refined),
    style:profile?.writing_style||null,
    referencePattern:pattern ? {
      avgWords:pattern.avgWords,
      avgSentences:pattern.avgSentences,
    } : null,
  },null,2));
  return refined;
}

function refinePromptLanguageIfEnabled(platform, prompt, profile) {
  if(!languageRefinementEnabled()) return prompt;
  return refinePromptLanguage(platform,prompt,profile);
}

function promptFeedbackDir() {
  return path.join(__dirname,"prompt_feedback");
}

function promptOptimizationDir() {
  return path.join(__dirname,"prompt_optimization");
}

function readPromptFeedbackEntries() {
  const dir=promptFeedbackDir();
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name=>name.endsWith(".json"))
    .map(name=>{
      try{return JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));}
      catch{return null;}
    })
    .filter(Boolean);
}

function countBy(values) {
  const counts={};
  for(const value of values.filter(Boolean)) counts[value]=(counts[value]||0)+1;
  return counts;
}

function commonTags(entries) {
  return countBy(entries.flatMap(entry=>Array.isArray(entry.issue_tags)?entry.issue_tags:[]));
}

function addOptimizationRule(rules, rule, reason, count=0) {
  if(!rules.some(r=>r.rule===rule)) rules.push({rule,reason,count});
}

function buildOptimizationRulesForEntries(entries) {
  const rules=[];
  if(!entries.length) return rules;
  const tags=commonTags(entries);
  const avgRating=entries.reduce((sum,entry)=>sum+(Number(entry.rating)||0),0)/entries.length;
  const high=(tag)=>Number(tags[tag]||0)>=2 || (entries.length>=3 && Number(tags[tag]||0)/entries.length>=0.34);
  if(avgRating<3.5) addOptimizationRule(rules,"tighten prompt specificity","average rating below target",entries.length);
  if(high("too generic")) {
    addOptimizationRule(rules,"increase camera specificity","too generic feedback is frequent",tags["too generic"]);
    addOptimizationRule(rules,"increase environment detail","too generic feedback is frequent",tags["too generic"]);
    addOptimizationRule(rules,"increase motion detail","too generic feedback is frequent",tags["too generic"]);
  }
  if(high("too cinematic")) addOptimizationRule(rules,"reduce cinematic prose","too cinematic feedback is frequent",tags["too cinematic"]);
  if(high("wrong dialogue")) addOptimizationRule(rules,"raise speech caution","wrong dialogue feedback is frequent",tags["wrong dialogue"]);
  if(high("wrong camera")) addOptimizationRule(rules,"increase camera weighting","wrong camera feedback is frequent",tags["wrong camera"]);
  if(high("wrong motion")) addOptimizationRule(rules,"reduce unsupported motion","wrong motion feedback is frequent",tags["wrong motion"]);
  if(high("wrong lighting")) addOptimizationRule(rules,"increase lighting specificity","wrong lighting feedback is frequent",tags["wrong lighting"]);
  if(high("inaccurate environment")) addOptimizationRule(rules,"reduce background dominance","environment accuracy feedback is frequent",tags["inaccurate environment"]);
  if(high("inaccurate subject")) addOptimizationRule(rules,"prioritize subject specificity","subject accuracy feedback is frequent",tags["inaccurate subject"]);
  if(high("poor audio recreation")) addOptimizationRule(rules,"raise audio caution","audio recreation feedback is frequent",tags["poor audio recreation"]);
  return rules;
}

function writePromptOptimizationSummary(summary) {
  try{
    const dir=promptOptimizationDir();
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"latest.json"),JSON.stringify(summary,null,2),"utf8");
  }catch(e){
    console.error("[prompt optimization write failed]",e.message);
  }
}

function loadPromptOptimizationRules() {
  if(promptOptimizationRulesCache) return promptOptimizationRulesCache;
  const entries=readPromptFeedbackEntries();
  const byPlatform={};
  const byReelType={};
  for(const entry of entries) {
    const platform=String(entry.platform||"unknown").toLowerCase();
    const reelType=String(entry.reel_type||"other").toLowerCase();
    if(!byPlatform[platform]) byPlatform[platform]=[];
    if(!byReelType[reelType]) byReelType[reelType]=[];
    byPlatform[platform].push(entry);
    byReelType[reelType].push(entry);
  }
  const platformRules={};
  const reelTypeRules={};
  for(const [platform,items] of Object.entries(byPlatform)) {
    platformRules[platform]=buildOptimizationRulesForEntries(items);
  }
  for(const [reelType,items] of Object.entries(byReelType)) {
    reelTypeRules[reelType]=buildOptimizationRulesForEntries(items);
  }
  const summary={
    generatedAt:new Date().toISOString(),
    feedbackCount:entries.length,
    platformRules,
    reelTypeRules,
  };
  writePromptOptimizationSummary(summary);
  promptOptimizationRulesCache=summary;
  return summary;
}

function splitPromptSentences(prompt) {
  return normalizePromptSentences(prompt).match(/[^.!?]+[.!?]+/g)||[normalizePromptSentences(prompt)].filter(Boolean);
}

function moveMatchingSentenceEarlier(prompt, regex) {
  const sentences=splitPromptSentences(prompt);
  const index=sentences.findIndex(sentence=>regex.test(sentence));
  if(index<=0) return normalizePromptSentences(prompt);
  const [sentence]=sentences.splice(index,1);
  sentences.splice(Math.min(1,sentences.length),0,sentence);
  return normalizePromptSentences(sentences.join(" "));
}

function softenUnsupportedAudio(prompt) {
  return normalizePromptSentences(prompt)
    .replace(/\bthe speaker says\b/gi,"the speaker is heard")
    .replace(/\bexact dialogue\b/gi,"speech context")
    .replace(/\bquoted dialogue\b/gi,"speech context")
    .replace(/\bsays:\s*["'][^"']+["']/gi,"speaks in a grounded, non-quoted way");
}

function applyRuleToPrompt(prompt, rule) {
  let text=normalizePromptSentences(prompt);
  if(rule==="reduce cinematic prose") {
    text=text
      .replace(/\bultra[- ]cinematic\b/gi,"natural")
      .replace(/\bepic cinematic\b/gi,"clear visual")
      .replace(/\bdramatic cinematic prose\b/gi,"direct visual language")
      .replace(/\bcinematic atmosphere\b/gi,"visible atmosphere");
  } else if(rule==="increase camera specificity"||rule==="increase camera weighting") {
    text=moveMatchingSentenceEarlier(text,/\b(camera|framing|frame|composition|lens|shot)\b/i);
    text=text.replace(/\bclear framing\b/gi,"precise portrait framing");
  } else if(rule==="increase environment detail"||rule==="reduce background dominance") {
    text=text.replace(/\bvisible environment\b/gi,"the surrounding space");
    if(rule==="reduce background dominance") {
      text=text.replace(/\bbackground dominates\b/gi,"background supports the subject");
    }
  } else if(rule==="increase motion detail") {
    text=text.replace(/\brealistic motion\b/gi,"grounded visible motion");
  } else if(rule==="reduce unsupported motion") {
    text=text
      .replace(/\bnatural breathing and gentle blinking\b/gi,"subtle realistic presence")
      .replace(/\bslow cinematic push-in\b/gi,"locked-off visual emphasis")
      .replace(/\bhandheld drift\b/gi,"observational framing");
  } else if(rule==="increase lighting specificity") {
    text=text.replace(/\bgrounded visible lighting\b/gi,"the visible lighting described in the scene");
  } else if(rule==="prioritize subject specificity") {
    text=moveMatchingSentenceEarlier(text,/\b(subject|creator|presenter|product|face|person|hands)\b/i);
  } else if(rule==="raise speech caution"||rule==="raise audio caution") {
    text=softenUnsupportedAudio(text);
  } else if(rule==="tighten prompt specificity") {
    text=text
      .replace(/\bgeneric\b/gi,"specific")
      .replace(/\bclear visual intent\b/gi,"precise visual intent");
  }
  return normalizePromptSentences(text);
}

function applyPromptOptimization(platform, reelType, draftPrompt) {
  if(!feedbackOptimizationEnabled()) return draftPrompt;
  const rules=loadPromptOptimizationRules();
  const key=String(platform||"").toLowerCase();
  const reel=String(reelType||"other").toLowerCase();
  const platformRules=rules.platformRules?.[key]||[];
  const reelRules=rules.reelTypeRules?.[reel]||[];
  const combined=[...platformRules,...reelRules];
  const appliedRules=[];
  let prompt=String(draftPrompt||"");
  for(const item of combined) {
    const before=prompt;
    prompt=applyRuleToPrompt(prompt,item.rule);
    if(prompt!==before) appliedRules.push(item.rule);
    else if(!appliedRules.includes(item.rule)&&["raise speech caution","raise audio caution","increase camera weighting"].includes(item.rule)) {
      appliedRules.push(item.rule);
    }
  }
  console.log("[prompt optimization]");
  console.log(JSON.stringify({
    platform:key,
    reelType:reel,
    appliedRules:[...new Set(appliedRules)],
  },null,2));
  return prompt;
}

function repeatedWordCount(prompt) {
  const words=String(prompt||"").toLowerCase().match(/\b[a-z][a-z-]{3,}\b/g)||[];
  const counts=countBy(words);
  return Object.values(counts).filter(count=>count>=3).reduce((sum,count)=>sum+count,0);
}

function repeatedSentenceStarts(prompt) {
  const starts=splitPromptSentences(prompt)
    .map(sentence=>sentence.trim().split(/\s+/).slice(0,3).join(" ").toLowerCase())
    .filter(Boolean);
  return starts.length-new Set(starts).size;
}

function validatePromptNaturalness(platform, prompt) {
  const text=normalizePromptSentences(prompt);
  const lower=text.toLowerCase();
  const issues=[];
  const roboticPhrases=[
    "already described",
    "specific visible",
    "specific framing already",
    "keeps attention on",
    "remains grounded",
    "set the scene",
    "clear readable detail",
    "visible surroundings already established",
    "motion remains restrained",
    "generation-oriented video prompt",
    "fact-preserving and grounded",
  ];
  const roboticHits=roboticPhrases.filter(phrase=>lower.includes(phrase));
  if(roboticHits.length) issues.push(...roboticHits.map(phrase=>`robotic phrase: ${phrase}`));
  const repeatWords=repeatedWordCount(text);
  if(repeatWords>=6) issues.push("repetitive wording");
  const duplicateStarts=repeatedSentenceStarts(text);
  if(duplicateStarts>0) issues.push("duplicated sentence rhythm");
  const sentences=splitPromptSentences(text);
  const avgSentenceWords=wordCount(text)/Math.max(sentences.length,1);
  if(avgSentenceWords<6||avgSentenceWords>34) issues.push("unnatural sentence rhythm");
  const cinematicTerms=(lower.match(/\b(camera|framing|light|lighting|shadow|motion|movement|scene|shot|composition|atmosphere|focus)\b/g)||[]).length;
  const cinematicFlowScore=Math.max(0,Math.min(10,5+cinematicTerms-Math.max(0,roboticHits.length*2)-duplicateStarts));
  const repetitionScore=Math.max(0,10-Math.min(10,repeatWords+duplicateStarts*2));
  const roboticPhraseScore=Math.min(10,roboticHits.length*3+(lower.includes("already described")?4:0));
  const naturalnessScore=Math.max(0,Math.min(10,10-roboticPhraseScore*0.8-Math.max(0,repeatWords-3)*0.5-duplicateStarts*1.5-(avgSentenceWords<6||avgSentenceWords>34?1.5:0)));
  return {
    naturalnessScore:Number(naturalnessScore.toFixed(2)),
    repetitionScore:Number(repetitionScore.toFixed(2)),
    roboticPhraseScore:Number(roboticPhraseScore.toFixed(2)),
    cinematicFlowScore:Number(cinematicFlowScore.toFixed(2)),
    issues,
  };
}

function applyPromptGuardrails(platform, versions) {
  const optimized=versions.optimized_prompt||versions.refined_prompt||versions.draft_prompt||"";
  if(!promptGuardrailsEnabled()) {
    return optimized;
  }
  const optimizedScore=validatePromptNaturalness(platform,optimized);
  const refined=versions.refined_prompt||versions.draft_prompt||optimized;
  const refinedScore=validatePromptNaturalness(platform,refined);
  const rolledBack=optimizedScore.roboticPhraseScore>=4||optimizedScore.naturalnessScore<7||(
    optimized!==refined&&optimizedScore.naturalnessScore<refinedScore.naturalnessScore
  );
  const finalPrompt=rolledBack ? refined : optimized;
  console.log("[prompt guardrails]");
  console.log(JSON.stringify({
    platform,
    rolledBack,
    naturalnessScore:optimizedScore.naturalnessScore,
    repetitionScore:optimizedScore.repetitionScore,
    roboticPhraseScore:optimizedScore.roboticPhraseScore,
    cinematicFlowScore:optimizedScore.cinematicFlowScore,
    issues:optimizedScore.issues,
  },null,2));
  return finalPrompt;
}

function visualTranslationRuleSet(platform, semanticData={}) {
  const subject=cleanFact(semanticData?.creator_archetype)||cleanFact(semanticData?.subjects)||"subject";
  const object=cleanFact(semanticData?.primary_object)||cleanFact(semanticData?.hero_element)||cleanFact(semanticData?.product_identity)||"main visual detail";
  const isProduct=/product|food/i.test([semanticData?.content_type,semanticData?.reel_type].join(" "));
  const visualSubject=isProduct ? object : subject;
  return [
    {
      pattern:/attention stays centered on eye contact before shifting naturally toward expressive posing/gi,
      replacement:`the camera keeps the ${visualSubject}'s eye contact as the visual focus before subtle pose changes draw attention toward expression and styling`,
    },
    {
      pattern:/attention follows the body movement through the performance cadence/gi,
      replacement:"the camera follows the body movement as the performance rhythm carries through the shot",
    },
    {
      pattern:/attention follows the texture movement through the preparation process/gi,
      replacement:"the camera follows the texture as it moves through the preparation",
    },
    {
      pattern:/attention remains centered on the hero product before moving toward packaging detail/gi,
      replacement:"the framing holds on the hero product before guiding the eye toward packaging detail",
    },
    {
      pattern:/attention remains on the presenter while gestures support the explanation/gi,
      replacement:"the framing stays on the presenter while gestures visually support the explanation",
    },
    {
      pattern:/visual priority flow:?/gi,
      replacement:"the framing emphasizes",
    },
    {
      pattern:/full-body motion first, rhythm second, camera engagement third/gi,
      replacement:"the framing emphasizes full-body motion first, then rhythm and camera engagement",
    },
    {
      pattern:/face first, expression second, movement third/gi,
      replacement:"the framing emphasizes the face first, then expression and movement",
    },
    {
      pattern:/texture first, motion second, ingredient detail third/gi,
      replacement:"the shot emphasizes texture first, then motion and ingredient detail",
    },
    {
      pattern:/product first, branding second, texture third/gi,
      replacement:"the shot emphasizes the product first, then branding and texture",
    },
    {
      pattern:/performance progression becomes more expressive/gi,
      replacement:"the subject gradually shifts through more expressive portrait poses",
    },
    {
      pattern:/camera-aware posing becomes gradually more expressive/gi,
      replacement:"the subject gradually shifts through more expressive camera-aware poses",
    },
    {
      pattern:/movement flows continuously without abrupt transitions/gi,
      replacement:"movement continues naturally through the shot",
    },
    {
      pattern:/the performance flows continuously without invented choreography/gi,
      replacement:"the performance movement continues fluidly without specifying exact choreography",
    },
    {
      pattern:/motion continuity/gi,
      replacement:"movement continuity",
    },
    {
      pattern:/performance cadence/gi,
      replacement:"visible performance rhythm",
    },
    {
      pattern:/semantic scene evolution/gi,
      replacement:"visual progression",
    },
    {
      pattern:/focus transition/gi,
      replacement:"visual focus shifts",
    },
    {
      pattern:/attention progression/gi,
      replacement:"viewer attention shifts",
    },
  ];
}

function platformVisualTranslation(platform, prompt) {
  const key=String(platform||"").toLowerCase();
  let text=normalizePromptSentences(prompt);
  if(key==="veo") {
    text=text
      .replace(/\bthe framing emphasizes\b/gi,"the camera frames")
      .replace(/\bthe shot emphasizes\b/gi,"the shot visually emphasizes");
  } else if(key==="sora") {
    text=text
      .replace(/\bmovement continues naturally through the shot\b/gi,"as the moment unfolds, movement continues naturally through the shot")
      .replace(/\bthe camera keeps\b/gi,"as the shot develops, the camera keeps");
  } else if(key==="runway") {
    text=text
      .replace(/\bthe camera keeps\b/gi,"Keep")
      .replace(/\bthe framing holds\b/gi,"Hold")
      .replace(/\bthe shot visually emphasizes\b/gi,"Emphasize");
  } else if(key==="kling") {
    text=text
      .replace(/\bthe camera frames\b/gi,"the composition frames")
      .replace(/\bthe shot emphasizes\b/gi,"the composition emphasizes");
  } else if(key==="pika") {
    text=text
      .replace(/\bas the moment unfolds,\s*/gi,"")
      .replace(/\bthe camera follows\b/gi,"Camera follows")
      .replace(/\bthe framing emphasizes\b/gi,"Frame emphasizes");
  }
  return normalizePromptSentences(text);
}

function translateToGenerativeVisualLanguage(platform, semanticData, prompt) {
  if(!visualTranslationEnabled()) return prompt;
  const before=String(prompt||"");
  let translated=before;
  const replacements=[];
  for(const rule of visualTranslationRuleSet(platform,semanticData)) {
    if(rule.pattern.test(translated)) {
      rule.pattern.lastIndex=0;
      translated=translated.replace(rule.pattern,rule.replacement);
      replacements.push(rule.replacement);
    }
    rule.pattern.lastIndex=0;
  }
  translated=platformVisualTranslation(platform,translated);
  translated=normalizePromptSentences(translated)
    .replace(/\battention progression\b/gi,"viewer attention shifts")
    .replace(/\bvisual priority flow\b/gi,"visual emphasis")
    .replace(/\bsemantic scene evolution\b/gi,"visual progression");
  const changed=translated!==before;
  console.log("[visual language translation]");
  console.log(JSON.stringify({
    translated:changed,
    platform,
    replacements,
  },null,2));
  return translated;
}

function buildMasterPromptFromBrief(brief) {
  const subject=cleanFact(brief?.subject)||"main visible subject";
  const action=cleanFact(brief?.action)||cleanFact(brief?.generation_intent)||"holds a composed still presence";
  const camera=cleanFact(brief?.camera)||"static camera with clear framing";
  const lighting=cleanFact(brief?.lighting)||"grounded visible lighting";
  const environment=cleanFact(brief?.environment)||"visible environment";
  const motion=cleanFact(brief?.motion)||"motion remains restrained and grounded";
  const mood=cleanFact(brief?.mood);
  const visualGoal=cleanFact(brief?.visual_goal);
  const reelEnergy=cleanFact(brief?.reel_energy);
  const danceEnergy=cleanFact(brief?.dance_energy);
  const performanceStyle=cleanFact(brief?.performance_style);
  const bodyMotionStyle=cleanFact(brief?.body_motion_style);
  const motionRhythm=cleanFact(brief?.motion_rhythm);
  const cameraEngagement=cleanFact(brief?.camera_engagement);
  const creatorArchetype=cleanFact(brief?.creator_archetype);
  const creatorPresence=cleanFact(brief?.creator_presence);
  const contentPersonality=cleanFact(brief?.content_personality);
  const presentationStyle=cleanFact(brief?.presentation_style);
  const viewerRelationship=cleanFact(brief?.viewer_relationship);
  const temporalOpening=cleanFact(brief?.temporal_opening);
  const temporalProgression=cleanFact(brief?.temporal_progression);
  const temporalContinuity=cleanFact(brief?.temporal_continuity);
  const momentFlow=cleanFact(brief?.moment_flow);
  const sceneEvolution=cleanFact(brief?.scene_evolution);
  const performanceProgression=cleanFact(brief?.performance_progression);
  const primaryVisualFocus=cleanFact(brief?.primary_visual_focus);
  const secondaryVisualFocus=cleanFact(brief?.secondary_visual_focus);
  const attentionProgression=cleanFact(brief?.attention_progression);
  const focusTransition=cleanFact(brief?.focus_transition);
  const cameraIntention=cleanFact(brief?.camera_intention);
  const visualPriorityFlow=cleanFact(brief?.visual_priority_flow);
  const socialAesthetic=cleanFact(brief?.social_aesthetic);
  const cameraPresence=cleanFact(brief?.camera_presence);
  const audio=buildAudioPromptGuidance("master",brief);
  const style=cleanFact(brief?.generation_intent)||"generation-ready cinematic realism";
  const sentences=[
    reelEnergy ? `${reelEnergy}.` : "",
    danceEnergy ? `${danceEnergy}.` : "",
    creatorArchetype ? `${creatorArchetype}.` : "",
    temporalOpening ? `${temporalOpening}.` : "",
    performanceStyle ? `${performanceStyle}.` : "",
    presentationStyle ? `${presentationStyle}.` : "",
    bodyMotionStyle ? `${bodyMotionStyle}.` : "",
    `${subject} ${action}.`,
    primaryVisualFocus ? `Prioritize ${primaryVisualFocus}.` : "",
    `Frame with ${camera}.`,
    cameraIntention ? `${cameraIntention}.` : "",
    cameraEngagement ? `${cameraEngagement}.` : creatorPresence ? `${creatorPresence}.` : cameraPresence ? `${cameraPresence}.` : "",
    `${lighting} shapes the subject and keeps details readable.`,
    `Set the scene in ${environment}.`,
    `${motion}.`,
    temporalProgression ? `${temporalProgression}.` : "",
    temporalContinuity ? `${temporalContinuity}.` : "",
    momentFlow ? `${momentFlow}.` : "",
    attentionProgression ? `${attentionProgression}.` : "",
    focusTransition ? `${focusTransition}.` : "",
    motionRhythm ? `${motionRhythm}.` : "",
    mood ? `Maintain ${mood}.` : "",
    contentPersonality ? `Keep the creator personality ${contentPersonality}.` : "",
    socialAesthetic ? `Carry ${socialAesthetic}.` : "",
    viewerRelationship ? `${viewerRelationship}.` : "",
    sceneEvolution ? `${sceneEvolution}.` : "",
    performanceProgression ? `${performanceProgression}.` : "",
    secondaryVisualFocus ? `Let secondary emphasis fall on ${secondaryVisualFocus}.` : "",
    visualPriorityFlow ? `${visualPriorityFlow}.` : "",
    visualGoal ? `Direct attention toward ${visualGoal}.` : "",
    audio ? audio : "",
    `Style: grounded, generation-oriented video prompt with clear visual intent for Veo, Sora, Runway, Kling, and Pika.`,
    style&&!/generation-ready cinematic realism/i.test(style) ? `Intent: ${style}.` : "",
  ].filter(Boolean);
  let prompt=cleanMasterPromptText(sentences.join(" "));
  if(wordCount(prompt)<60) {
    prompt=cleanMasterPromptText(`${prompt} Use subject-first wording, explicit camera framing, practical lighting detail, grounded environment context, realistic motion, and a concise final style direction.`);
  }
  prompt=trimPromptWords(prompt,120);
  console.log("[master prompt]");
  console.log(JSON.stringify({
    words:wordCount(prompt),
    subject,
    action,
    camera,
  },null,2));
  return refinePromptLanguageIfEnabled("master",prompt,null);
}

function buildMasterPrompt(factual,stylePreset,generationMode="cinematic") {
  const cameraGrammar=generateCameraLanguage(factual,"video");
  const microMotion=buildMicroMotionLayer(factual,generationMode);
  const shotPlan=buildShotPlan(factual,cameraGrammar,microMotion);
  const brief=buildDirectorBrief(factual,cameraGrammar,microMotion,shotPlan);
  return buildMasterPromptFromBrief(brief);
}

function rewriteSlotLanguage(slotValue, factual) {
  let text=cleanFact(slotValue);
  if(!text) return "";
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const environment=cleanFact(factual?.environment);
  const role=/doctor|nurse|scrub|hospital|clinic|healthcare/i.test([text,environment].join(" "))
    ? "healthcare professional"
    : "";
  text=text
    .replace(/\b1,\s*/gi,"")
    .replace(/\byoung adult,\s*female,\s*medium build\b/gi,role ? `young female ${role}` : "young female subject")
    .replace(/\byoung adult,\s*female\b/gi,role ? `young female ${role}` : "young female subject")
    .replace(/\bmedium build\b/gi,"")
    .replace(/\bin indoor\b/gi,"in")
    .replace(/\bnone visible\b|\bnot enough evidence\b|\bnot visible\b/gi,"")
    .replace(/\s*,\s*/g,", ")
    .replace(/\s+/g," ")
    .replace(/,\s*(in|on|under|with)\b/gi," $1")
    .trim();
  if(contentType==="food") {
    text=text
      .replace(/\bbread with chocolate spread\b/gi,"toast covered with glossy chocolate spread")
      .replace(/\bchocolate spread\b/gi,"glossy chocolate spread");
  }
  if(/\bhorse\b/i.test(text)&&!/\brider\b/i.test(text)) {
    text=text.replace(/\bhorse\b/i,"rider mounted on a horse");
  }
  return text.replace(/\s+/g," ").trim();
}

function shotPlanOrderForPlatform(platform) {
  const orders={
    runway:["opening_visual","primary_action","camera_behavior","environment_response","visual_finish"],
    veo:["opening_visual","visual_finish","primary_action","secondary_motion","camera_behavior","environment_response"],
    sora:["opening_visual","primary_action","secondary_motion","camera_behavior","environment_response","visual_finish"],
    kling:["opening_visual","camera_behavior","primary_action","secondary_motion","visual_finish"],
    pika:["opening_visual","primary_action","camera_behavior"],
  };
  return orders[String(platform||"").toLowerCase()]||orders.runway;
}

function buildPromptSlots(platform, shotPlan, factual) {
  const slotOrder=shotPlanOrderForPlatform(platform);
  const labels={
    opening_visual:"OPENING_VISUAL",
    primary_action:"PRIMARY_ACTION",
    secondary_motion:"SECONDARY_MOTION",
    camera_behavior:"CAMERA_BEHAVIOR",
    environment_response:"ENVIRONMENT_RESPONSE",
    visual_finish:"VISUAL_FINISH",
  };
  const populatedSlots=slotOrder
    .map(key=>({key,label:labels[key]||key.toUpperCase(),value:rewriteSlotLanguage(shotPlan?.[key],factual)}))
    .filter(slot=>usableFact(slot.value));
  const totalWords=populatedSlots.reduce((sum,slot)=>sum+wordCount(slot.value),0)||1;
  const envSlot=populatedSlots.find(slot=>slot.label==="ENVIRONMENT_RESPONSE");
  const environmentWords=envSlot ? wordCount(envSlot.value) : 0;
  const ratio=environmentWords/totalWords;
  if(envSlot&&ratio>0.2) {
    envSlot.value=envSlot.value.split(/[.!?]/)[0].split(/\s+/).slice(0,Math.max(3,Math.floor(totalWords*0.2))).join(" ").trim();
  }
  console.log("[background limiter]");
  console.log(JSON.stringify({
    environmentWords,
    totalWords,
    ratio:Math.round(ratio*100)/100,
  },null,2));
  const contentType=cleanFact(factual?.content_type)||"other";
  return {
    platform,
    content_type:contentType,
    slotOrder:populatedSlots.map(slot=>slot.label),
    populatedSlots:populatedSlots.reduce((acc,slot)=>{
      acc[slot.label]=slot.value;
      return acc;
    },{}),
  };
}

function buildStage2Context(factual, shotPlan, promptSlots, promptComponents={}, directorBrief=null) {
  const compact={
    content_type:cleanFact(factual?.content_type),
    reel_type:cleanFact(factual?.reel_type),
    scene_purpose:cleanFact(factual?.scene_purpose),
    activity_context:cleanFact(factual?.activity_context),
    content_theme:cleanFact(factual?.content_theme),
    reel_energy:cleanFact(factual?.reel_energy),
    performance_style:cleanFact(factual?.performance_style),
    social_aesthetic:cleanFact(factual?.social_aesthetic),
    motion_style:cleanFact(factual?.motion_style),
    viewer_feeling:cleanFact(factual?.viewer_feeling),
    camera_presence:cleanFact(factual?.camera_presence),
    music_sync_energy:cleanFact(factual?.music_sync_energy),
    dance_energy:cleanFact(factual?.dance_energy),
    movement_density:cleanFact(factual?.movement_density),
    motion_rhythm:cleanFact(factual?.motion_rhythm),
    body_motion_style:cleanFact(factual?.body_motion_style),
    beat_sync_strength:cleanFact(factual?.beat_sync_strength),
    performance_intensity:cleanFact(factual?.performance_intensity),
    camera_engagement:cleanFact(factual?.camera_engagement),
    movement_continuity:cleanFact(factual?.movement_continuity),
    motion_focus:cleanFact(factual?.motion_focus),
    creator_archetype:cleanFact(factual?.creator_archetype),
    creator_presence:cleanFact(factual?.creator_presence),
    content_personality:cleanFact(factual?.content_personality),
    social_platform_style:cleanFact(factual?.social_platform_style),
    presentation_style:cleanFact(factual?.presentation_style),
    viewer_relationship:cleanFact(factual?.viewer_relationship),
    temporal_opening:cleanFact(factual?.temporal_opening),
    temporal_progression:cleanFact(factual?.temporal_progression),
    temporal_continuity:cleanFact(factual?.temporal_continuity),
    moment_flow:cleanFact(factual?.moment_flow),
    scene_evolution:cleanFact(factual?.scene_evolution),
    performance_progression:cleanFact(factual?.performance_progression),
    primary_visual_focus:cleanFact(factual?.primary_visual_focus),
    secondary_visual_focus:cleanFact(factual?.secondary_visual_focus),
    attention_progression:cleanFact(factual?.attention_progression),
    focus_transition:cleanFact(factual?.focus_transition),
    camera_intention:cleanFact(factual?.camera_intention),
    visual_priority_flow:cleanFact(factual?.visual_priority_flow),
    overlay_topic:cleanFact(factual?.overlay_topic),
    spoken_topic:cleanFact(factual?.spoken_topic),
    speech_language:cleanFact(factual?.speech_language),
    audio_type:cleanFact(factual?.audio_type),
    audio_role:cleanFact(factual?.audio_role),
    dialogue_summary:cleanFact(factual?.dialogue_summary),
    music_mood:cleanFact(factual?.music_mood),
    ambient_audio:cleanFact(factual?.ambient_audio),
    primary_object:rewriteSlotLanguage(factual?.primary_object,factual),
    hero_element:rewriteSlotLanguage(factual?.hero_element,factual),
    director_brief:directorBrief,
    prompt_components:promptComponents,
    shot_plan:shotPlan,
    prompt_slots:promptSlots,
  };
  for(const key of Object.keys(compact)) {
    if(compact[key]===""||compact[key]==null) delete compact[key];
  }
  return compact;
}

function buildMicroMotionLayer(factual,generationMode="cinematic") {
  const contentType=String(factual?.content_type||"").trim().toLowerCase();
  const subjectMotion=cleanFact(factual?.subject_motion).toLowerCase();
  const cameraMotion=cleanFact(factual?.camera_motion).toLowerCase();
  const visibleMotion=cleanFact(factual?.visible_motion_cues).toLowerCase();
  const inferredMotion=cleanFact(factual?.inferred_motion).toLowerCase();
  const environmentText=[
    cleanFact(factual?.pose_action),
    Array.isArray(factual?.secondary_objects) ? factual.secondary_objects.join(", ") : cleanFact(factual?.secondary_objects),
    cleanFact(factual?.environment),
    cleanFact(factual?.surfaces),
  ].join(" ").toLowerCase();
  const subjectStatic=/^(none|none visible|not visible|not enough evidence|static|)$/.test(subjectMotion);
  const cameraStatic=/^(static|none|none visible|not visible|not enough evidence|locked-off|locked off|)$/.test(cameraMotion);
  const unknownMotion=/^(none|none visible|not visible|not enough evidence|static|)$/;
  const primaryMotionPresent=[subjectMotion,visibleMotion,inferredMotion].some(v=>v&&!unknownMotion.test(v));
  const result={
    content_type:contentType||"other",
    applied:false,
    primaryMotionPresent,
    supplementalMotionApplied:false,
    generated_layer:"",
  };
  if(generationMode!=="cinematic") return result;
  if(isStaticPortraitWithoutMotion(factual)) {
    console.log("[static portrait guard]");
    console.log(JSON.stringify({
      triggered:true,
      removedAction:false,
      removedMicroMotion:true,
    },null,2));
    return result;
  }

  const layers=[];
  if(contentType==="human_scene") {
    layers.push(primaryMotionPresent
      ? "supplemental realism only: natural breathing, occasional blinking, minor gaze adjustments, subtle posture settling, fabric settling, and loose hair movement when hair is visible"
      : "natural breathing, occasional blinking, subtle gaze shifts, minor posture settling, and light fabric settling");
  } else if(contentType==="product") {
    if(subjectStatic&&cameraStatic) layers.push("gentle focus breathing, natural highlight variation, soft attention shift across product details, commercial hold on branding, and restrained commercial pacing");
  } else if(contentType==="food") {
    if(subjectStatic&&cameraStatic) layers.push("gentle focus breathing, natural highlight variation, subtle emphasis on food texture, gradual visual attention toward toppings or ingredients, and restrained commercial pacing");
  } else if(contentType==="interior_design") {
    layers.push("gentle light variation, fabric settling where fabric is visible, and subtle depth cues across the room composition");
  } else if(contentType==="environment_scene") {
    layers.push("subtle environmental motion only from visible elements");
  }

  if(/\bhorse|equestrian|bridle|saddle|mane\b/.test(environmentText)) {
    layers.push("horse weight shift, subtle mane movement, and slight bridle movement only where visually plausible");
  }
  if(/\bforest|tree|trees|leaf|leaves|foliage|woodland\b/.test(environmentText)) {
    layers.push("subtle foliage movement");
  }
  if(/\bwater|river|lake|ocean|sea|pool|stream|wave|waves\b/.test(environmentText)) {
    layers.push("minor surface ripple");
  }
  if(/\binterior|room|studio|hallway|curtain|fabric|cloth|sofa|bed\b/.test(environmentText)&&contentType!=="product"&&contentType!=="food") {
    layers.push("gentle light variation and fabric settling where visible");
  }

  result.generated_layer=layers.filter(Boolean).join("; ");
  result.applied=Boolean(result.generated_layer);
  result.supplementalMotionApplied=result.applied&&primaryMotionPresent;
  return result;
}

function ocrTopicContext(factual) {
  const overlayTopic=cleanFact(factual?.overlay_topic);
  const textPresent=factual?.text_present===true || String(factual?.text_present).trim().toLowerCase()==="true";
  return {
    text_present:textPresent,
    overlay_topic:overlayTopic,
    applied:textPresent&&Boolean(overlayTopic),
  };
}

function stage2FactualContext(factual) {
  const safe={...factual};
  delete safe.transcript;
  return safe;
}

function generateCameraLanguage(factual, mediaType) {
  const lens=cleanFact(factual?.lens_feel).toLowerCase();
  const env=cleanFact(factual?.environment).toLowerCase();
  const pose=cleanFact(factual?.pose_action).toLowerCase();
  const stage1CameraMotion=cleanFact(factual?.camera_motion).toLowerCase();
  const cameraStatic=/^(static|none|none visible|not visible|not enough evidence|locked-off|locked off)$/i.test(stage1CameraMotion);
  const hasSubject=usableFact(factual?.subjects)||usableFact(factual?.face)||usableFact(factual?.pose_action);
  const close=/close|face|portrait|selfie|head|shoulder/.test([lens,pose,env].join(" "));
  const wide=/wide|landscape|architecture|room|street|plaza|outdoor/.test([lens,env].join(" "));
  const shallow=/shallow|bokeh|blur|portrait|background.*out of focus/.test(lens);
  const phone=/phone|mobile|iphone/.test(lens);
  const energyCamera=cleanFact(factual?.camera_presence).toLowerCase();
  const motionEnergyCamera=cleanFact(factual?.camera_engagement).toLowerCase();
  const motionEnergy=cleanFact(factual?.dance_energy).toLowerCase();
  const socialCamera=/subtle handheld portrait realism|camera-aware|influencer|social-media/.test(energyCamera);
  const dynamicSocialCamera=/dance|music|fitness|sports|energetic|camera-aware|actively engaging|follows the athletic action/.test([motionEnergyCamera,motionEnergy].join(" "));

  const framing=close ? "intimate medium portrait framing" : wide ? "wide environmental framing" : hasSubject ? "medium portrait framing" : "carefully composed product-style framing";
  const motionUnknown=mediaType==="video" && motionUnknownFromFacts(factual);
  const cameraMotion=mediaType==="video"
    ? (dynamicSocialCamera ? "dynamic portrait framing with subtle handheld music-video presence" : socialCamera ? "subtle handheld portrait framing with gentle natural camera drift" : cameraStatic || motionUnknown ? "static camera with locked-off observational framing" : usableFact(stage1CameraMotion) ? stage1CameraMotion : wide ? "gentle lateral slider movement" : close ? "slow cinematic push-in" : "subtle handheld drift")
    : "locked-off composition";
  const cameraSpeed=mediaType==="video" ? "slow, controlled, commercial pacing" : "still photographic timing";
  const lensBehavior=shallow ? "subject in focus with the background softly out of focus" : phone ? "natural perspective with restrained background separation" : "moderate depth of field with subject in focus";

  return {framing,cameraMotion,cameraSpeed,lensBehavior};
}

function calculateMotionScore({subjectMotion,environmentalMotion,cameraMotion,sceneProgression}) {
  const text=[subjectMotion,environmentalMotion,cameraMotion,sceneProgression].join(" ").toLowerCase();
  if(/run|jump|fight|spin|dance|action|fast|explosive|chase/.test(text)) return 85;
  if(/walk|turn|gesture|lift|reach|flowing|tracking|slider|progress/.test(text)) return 45;
  if(/breath|blink|hair|fabric|breeze|subtle|gentle|drift|push-in/.test(text)) return 24;
  return 10;
}

function motionUnknownFromFacts(factual) {
  const visible=cleanFact(factual?.visible_motion_cues).toLowerCase();
  const inferred=cleanFact(factual?.inferred_motion).toLowerCase();
  const subject=cleanFact(factual?.subject_motion).toLowerCase();
  const camera=cleanFact(factual?.camera_motion).toLowerCase();
  const environment=cleanFact(factual?.environmental_motion).toLowerCase();
  const hasNewMotionFields=subject||camera||environment;
  if(hasNewMotionFields) {
    const noSubject=/^(|none|none visible|not visible|not enough evidence|static)$/.test(subject);
    const noCamera=/^(|none|none visible|not visible|not enough evidence|static)$/.test(camera);
    const noEnvironment=/^(|none|none visible|not visible|not enough evidence|static)$/.test(environment);
    return noSubject&&noCamera&&noEnvironment;
  }
  const noVisibleMotion=/^(|none|none visible|no visible motion cues|not visible|not applicable|no motion|static image)$/.test(visible);
  const noInferredMotion=/^(|not enough evidence|none|none visible|not visible|unknown|static image)$/.test(inferred);
  return noVisibleMotion && noInferredMotion;
}

function cleanStyleText(text) {
  return String(text||"")
    .replace(/\bShot on [^.]+\.?/gi,"")
    .replace(/\bultra-realistic commercial aesthetic\b/gi,"grounded visual realism")
    .replace(/\bultra-realistic\b/gi,"grounded realistic")
    .replace(/\bfilm-grade color\b/gi,"natural color")
    .replace(/\bteal-orange grade\b/gi,"grounded color contrast")
    .replace(/\bcreamy bokeh\b/gi,"background softly out of focus")
    .replace(/\bARRI Alexa\b/gi,"grounded camera realism")
    .replace(/\bspherical 50mm lens\b/gi,"natural portrait lens feel")
    .replace(/\bmasterpiece\b/gi,"")
    .replace(/\baward-winning\b/gi,"")
    .replace(/\s+/g," ")
    .trim();
}

function groundedCompositionText(factual, fallback) {
  const lens=cleanFact(factual?.lens_feel);
  if(!usableFact(lens)) return fallback || "moderate depth of field with subject in focus";
  return lens
    .replace(/\b\d+\s*mm\b/gi,"")
    .replace(/\bARRI Alexa\b/gi,"")
    .replace(/\bHasselblad\b/gi,"")
    .replace(/\bPhase One\b/gi,"")
    .replace(/\bSony FX6\b/gi,"")
    .replace(/\bRED Komodo\b/gi,"")
    .replace(/\biPhone Pro\b/gi,"")
    .replace(/\bspherical lens\b/gi,"")
    .replace(/\banamorphic lens\b/gi,"")
    .replace(/\bcreamy bokeh\b/gi,"background softly out of focus")
    .replace(/\bfocal length\b/gi,"composition")
    .replace(/\s+/g," ")
    .replace(/^\s*[,;:-]\s*|\s*[,;:-]\s*$/g,"")
    .trim() || fallback || "moderate depth of field with subject in focus";
}

function groundedFactSummary(factual) {
  const clothing=[
    cleanFact(factual?.clothing_top),
    cleanFact(factual?.clothing_bottom),
    cleanFact(factual?.footwear),
    cleanFact(factual?.accessories),
  ].filter(usableFact).join("; ") || "no usable clothing fact";
  return {
    subject:cleanFact(factual?.subjects)||cleanFact(factual?.face)||"visible subject or object",
    clothing,
    pose:cleanFact(factual?.pose_action)||"visible pose or placement",
    environment:cleanFact(factual?.environment)||"visible environment",
    lighting:cleanFact(factual?.lighting)||"visible lighting",
    composition:groundedCompositionText(factual,"grounded composition"),
  };
}

function buildPromptComponents(factual) {
  const component=(...values)=>values.map(cleanFact).filter(usableFact).join("; ");
  const speechPresent=factual?.speech_present===true || String(factual?.speech_present).trim().toLowerCase()==="true";
  const speechConfidence=Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0));
  const action=buildActionAbstraction(factual);
  const audioParts=[];
  const audioType=cleanFact(factual?.audio_type);
  if(["speech","speech_and_music"].includes(audioType)&&speechPresent&&speechConfidence>=0.7) {
    if(usableFact(factual?.speech_language)) audioParts.push(`${cleanFact(factual.speech_language)} speech`);
    if(usableFact(factual?.dialogue_summary)) audioParts.push(cleanFact(factual.dialogue_summary));
    else if(usableFact(factual?.spoken_topic)) audioParts.push(cleanFact(factual.spoken_topic));
  }
  if(["music","speech_and_music"].includes(audioType)) audioParts.push("background music guidance");
  if(audioType==="ambient_audio") audioParts.push("ambient audio only");
  if(usableFact(factual?.music_mood)) audioParts.push(cleanFact(factual.music_mood));
  if(usableFact(factual?.ambient_audio)) audioParts.push(cleanFact(factual.ambient_audio));
  return {
    subject:component(factual?.creator_archetype,factual?.hero_element,factual?.primary_object,factual?.product_identity,factual?.subjects,factual?.face),
    action:component(factual?.presentation_style,action.primary_action_description,factual?.pose_action),
    camera:component(factual?.camera_intention,factual?.camera_motion,factual?.lens_feel),
    environment:component(factual?.environment,factual?.surfaces),
    lighting:component(factual?.lighting),
    atmosphere:component(factual?.creator_archetype,factual?.social_platform_style,factual?.content_personality,factual?.dance_energy,factual?.reel_energy,factual?.social_aesthetic,factual?.viewer_feeling,factual?.mood_atmosphere),
    motion:component(factual?.attention_progression,factual?.focus_transition,factual?.body_motion_style,factual?.motion_rhythm,factual?.movement_density,factual?.motion_style,factual?.subject_motion,factual?.visible_motion_cues,factual?.inferred_motion,factual?.environmental_motion,factual?.music_sync_energy,factual?.beat_sync_strength,factual?.temporal_progression,factual?.performance_progression),
    temporal:component(factual?.temporal_opening,factual?.temporal_progression,factual?.temporal_continuity,factual?.moment_flow,factual?.scene_evolution,factual?.performance_progression,factual?.visual_priority_flow,factual?.movement_continuity,factual?.performance_style,factual?.visible_motion_cues,factual?.scene_purpose,factual?.activity_context),
    audio:audioParts.join("; "),
    emotion:component(factual?.viewer_relationship,factual?.creator_presence,factual?.performance_intensity,factual?.viewer_feeling,factual?.camera_engagement,factual?.camera_presence,factual?.mood_atmosphere,factual?.speaker_intent),
    finish:component(factual?.primary_visual_focus,factual?.secondary_visual_focus,factual?.visual_priority_flow,factual?.lens_feel,factual?.color_palette,factual?.lighting),
  };
}

function assemblePromptFromProfile(platform, profile, components) {
  const structure=Array.isArray(profile?.preferred_structure) ? profile.preferred_structure : [];
  const keyFor=label=>{
    const text=String(label||"").toLowerCase();
    if(/cinematography|camera|framing|composition|shot/.test(text)) return "camera";
    if(/subject|character|creator/.test(text)) return "subject";
    if(/action/.test(text)) return "action";
    if(/scene|environment|context/.test(text)) return "environment";
    if(/style|quality|modifier|finish|visual/.test(text)) return "finish";
    if(/ambiance|atmosphere|mood/.test(text)) return "atmosphere";
    if(/audio|dialogue|sfx|sound/.test(text)) return "audio";
    if(/motion|transition/.test(text)) return "motion";
    if(/emotion|tone/.test(text)) return "emotion";
    if(/temporal|progression|continuity/.test(text)) return "temporal";
    if(/lighting/.test(text)) return "lighting";
    return "";
  };
  const sections=structure
    .map(label=>({label,key:keyFor(label)}))
    .filter(item=>item.key&&usableFact(components?.[item.key]))
    .map(item=>({section:item.label,value:components[item.key]}));
  console.log("[assembly order]");
  console.log(JSON.stringify({
    platform,
    order:structure,
    assembled:sections.map(s=>s.section),
  },null,2));
  return {
    platform,
    order:structure,
    sections,
    text:sections.map(s=>s.value).join(". "),
  };
}

function writingStyleSummary(profile) {
  const style=profile?.writing_style||{};
  return {
    tone:style.tone||[],
    sentence_structure:style.sentence_structure||[],
    preferred_wording:style.preferred_wording||[],
    level_of_detail:style.level_of_detail||[],
  };
}

function platformWriter(platform, profile, assembly, styleLabel, directorBrief=null) {
  const style=writingStyleSummary(profile);
  console.log("[platform writer]");
  console.log(JSON.stringify({platform,style:styleLabel},null,2));
  return {
    platform,
    style:styleLabel,
    writing_style:style,
    director_brief:directorBrief,
    sections:assembly?.sections||[],
    instruction:"Transform DIRECTOR_BRIEF into generation-oriented shot instructions using this platform writing style. Do not reconstruct facts or add new details.",
  };
}

function writeVeoStyle(profile, components, assembly, directorBrief=null) {
  return platformWriter("veo",profile,assembly,"cinematic prose",directorBrief);
}

function writeSoraStyle(profile, components, assembly, directorBrief=null) {
  return platformWriter("sora",profile,assembly,"temporal progression",directorBrief);
}

function writeRunwayStyle(profile, components, assembly, directorBrief=null) {
  return platformWriter("runway",profile,assembly,"production direction",directorBrief);
}

function writeKlingStyle(profile, components, assembly, directorBrief=null) {
  return platformWriter("kling",profile,assembly,"visual specificity",directorBrief);
}

function writePikaStyle(profile, components, assembly, directorBrief=null) {
  return platformWriter("pika",profile,assembly,"compact visual direction",directorBrief);
}

function writePlatformStyle(platform, profile, components, assembly, directorBrief=null) {
  const key=String(platform||"").toLowerCase();
  if(key==="veo") return writeVeoStyle(profile,components,assembly,directorBrief);
  if(key==="sora") return writeSoraStyle(profile,components,assembly,directorBrief);
  if(key==="runway") return writeRunwayStyle(profile,components,assembly,directorBrief);
  if(key==="kling") return writeKlingStyle(profile,components,assembly,directorBrief);
  if(key==="pika") return writePikaStyle(profile,components,assembly,directorBrief);
  return platformWriter(key,profile,assembly,"grounded visual wording",directorBrief);
}

function referencePatternTargetWords(pattern, profile, field) {
  if(pattern?.avgWords) {
    const avg=Number(pattern.avgWords)||0;
    const spread=avg<=40 ? 8 : avg<=70 ? 10 : 14;
    return `${Math.max(15,avg-spread)}-${avg+spread} words`;
  }
  return profile?.ideal_length
    ? `${profile.ideal_length.minimum_words}-${profile.ideal_length.maximum_words} words`
    : field==="keyframe" ? "55-75 words" : "75-95 words";
}

function buildLegacyPlatformPrompt(field, factual, stylePreset, instructions, generationMode="cinematic") {
  const p=getPreset(stylePreset||"cinematic");
  const style=[p.label,cleanStyleText(p.grade),cleanStyleText(p.pace),cleanStyleText(p.suffix)].filter(Boolean).join(" | ");
  const isVideoPlatform=field!=="keyframe";
  const stage2Facts=stage2FactualContext(factual);
  const motionFacts=generateImageMotionFacts(factual);
  const groundedMotion=groundedMotionSummary(factual);
  const microMotion=isVideoPlatform ? buildMicroMotionLayer(factual,generationMode) : {};
  const ocrContext=ocrTopicContext(factual);
  const speechContext=speechTopicContext(factual);
  const speechConfidence=speechConfidenceContext(factual);
  const speechLanguage=speechLanguageContext(factual);
  const semanticContext=semanticSceneContext(factual);
  const reelType=reelTypeContext(factual);
  const objContext=objectContext(factual);
  const screen=screenContext(factual);
  const workflowDomain=workflowDomainContext(factual);
  const cameraGrammar=generateCameraLanguage(factual,"video");
  const motionUnknown=motionUnknownFromFacts(factual);
  const stage1CameraMotion=cleanFact(factual?.camera_motion).toLowerCase();
  const cameraStatic=/^(static|none|none visible|not visible|not enough evidence|locked-off|locked off)$/.test(stage1CameraMotion);
  const grounded=groundedFactSummary(factual);
  const targetWords=field==="keyframe" ? "55-75 words" : field==="pika" ? "60-80 words" : "75-95 words";
  const motionRule=motionUnknown
    ? "Motion evidence is absent or unavailable. Use static composition, observational framing, locked-off composition, composed stillness, portrait framing, or still environment. Do not write breathing, blinking, hair movement, posture shifts, body movement, handheld drift, push-ins, slider movement, tracking, orbit, or invented camera motion."
    : "Use only motion or camera behavior supported by STAGE_1_FACTS, MOTION_SYNTHESIS, GROUNDED_MOTION_FACTS, MICRO_MOTION_LAYER, or CAMERA_GRAMMAR.";
  const cameraRule=cameraStatic
    ? "Stage 1 camera_motion is static. Do not generate slider movement, push-in, tracking shot, orbit, or camera drift. Use static camera, locked-off framing, or observational composition."
    : "Only generate camera movement when Stage 1 camera_motion contains actual motion evidence.";

  return `Generate the ${field.toUpperCase()} field using the existing grounded generation system.

STAGE_1_FACTS:
${JSON.stringify(stage2Facts)}

GROUNDING PRIORITY:
${JSON.stringify(grounded)}

MOTION_SYNTHESIS:
${JSON.stringify(motionFacts)}

GROUNDED_MOTION_FACTS:
${JSON.stringify(groundedMotion)}

MICRO_MOTION_LAYER:
${JSON.stringify(microMotion)}

OCR_TOPIC:
${JSON.stringify(ocrContext)}

SPOKEN_TOPIC:
${JSON.stringify(speechContext)}

SPEECH_CONFIDENCE:
${JSON.stringify(speechConfidence)}

SPEECH_LANGUAGE:
${JSON.stringify(speechLanguage)}

SEMANTIC_SCENE:
${JSON.stringify(semanticContext)}

REEL_TYPE:
${JSON.stringify(reelType)}

OBJECT_CONTEXT:
${JSON.stringify(objContext)}

SCREEN_CONTEXT:
${JSON.stringify(screen)}

WORKFLOW_DOMAIN:
${JSON.stringify(workflowDomain)}

CAMERA_GRAMMAR:
${JSON.stringify(cameraGrammar)}

STYLE:
${style}

PLATFORM DIRECTIONS:
${instructions}

GROUNDING RULES:
- Use only grounded details from the supplied facts and context.
- ${motionRule}
- ${cameraRule}
- If OCR topic exists, use it as context only; do not quote overlay text.
- If spoken topic exists, use it as context only; do not quote narration.
- If speech language is available and speech confidence is at least 0.5, mention language only when visually appropriate.
- Do not invent clothing, colors, ethnicity, location, props, products, branding, software names, actions, camera movement, or dialogue.
- Write generation instructions, not a social caption or scene summary.
- Avoid: ARRI Alexa, spherical 50mm lens, film-grade color, teal-orange grade, creamy bokeh, ultra-realistic commercial aesthetic, masterpiece, award-winning.
- Return only valid JSON: {"${field}":"${targetWords}."}`;
}

function isModernVideoPlatform(field) {
  return ["veo","sora","runway","kling","pika"].includes(String(field||"").toLowerCase());
}

function inspectStage2Assembly(prompt) {
  const text=String(prompt||"");
  return {
    includesDirectorPrompt:text.includes("DIRECTOR_PROMPT:"),
    includesDirectorBrief:text.includes("DIRECTOR_BRIEF:"),
    includesShotPlan:text.includes("SHOT_PLAN:")||text.includes("\"shot_plan\""),
    includesPlatformTemplate:text.includes("PLATFORM_TEMPLATE:"),
    includesCompactContext:text.includes("COMPACT_CONTEXT:"),
    includesPromptSlots:text.includes("PROMPT_SLOTS:"),
    includesAudioGuidance:text.includes("AUDIO_GUIDANCE:"),
    includesPlatformProfile:text.includes("PLATFORM_PROFILE:"),
  };
}

function stage2AssemblyReady(prompt) {
  const status=inspectStage2Assembly(prompt);
  return status.includesDirectorPrompt&&
    status.includesDirectorBrief&&
    status.includesShotPlan&&
    status.includesPlatformTemplate&&
    status.includesPromptSlots&&
    status.includesAudioGuidance&&
    status.includesPlatformProfile;
}

function buildPlatformPrompt(field, factual, stylePreset, instructions, generationMode="cinematic") {
  const intelligenceEnabled=promptIntelligenceEnabled();
  const modernVideoPlatform=isModernVideoPlatform(field);
  console.log("[prompt intelligence]");
  console.log(JSON.stringify({
    enabled:intelligenceEnabled||modernVideoPlatform,
    platform:field,
    forcedModernAssembly:modernVideoPlatform&&!intelligenceEnabled,
  },null,2));
  if(!intelligenceEnabled&&!modernVideoPlatform) {
    return buildLegacyPlatformPrompt(field,factual,stylePreset,instructions,generationMode);
  }
  const p=getPreset(stylePreset||"cinematic");
  const style=[p.label,cleanStyleText(p.grade),cleanStyleText(p.pace),cleanStyleText(p.suffix)].filter(Boolean).join(" | ");
  const isVideoPlatform=field!=="keyframe";
  const platformProfile=getPlatformGenerationProfile(field);
  if(isVideoPlatform) {
    console.log("[platform profile]");
    console.log(JSON.stringify({platform:field,profile:platformProfile},null,2));
  }
  const stage2Facts=stage2FactualContext(factual);
  const motionFacts=generateImageMotionFacts(factual);
  const groundedMotion=groundedMotionSummary(factual);
  const microMotion=buildMicroMotionLayer(factual,generationMode);
  const ocrContext=ocrTopicContext(factual);
  const speechContext=speechTopicContext(factual);
  const speechConfidence=speechConfidenceContext(factual);
  const speechLanguage=speechLanguageContext(factual);
  const speechApplied=isVideoPlatform&&platformProfile.semantic_focus&&Boolean(speechContext.spoken_topic||speechContext.speaker_intent);
  const semanticContext=semanticSceneContext(factual);
  const semanticApplied=isVideoPlatform&&platformProfile.semantic_focus&&Object.values(semanticContext).some(Boolean);
  const reelType=reelTypeContext(factual);
  const reelTypeApplied=isVideoPlatform&&(platformProfile.semantic_focus||platformProfile.commercial_focus||platformProfile.workflow_focus)&&reelType.reel_type&&reelType.reel_type!=="other";
  const objContext=objectContext(factual);
  const objectApplied=isVideoPlatform&&(platformProfile.commercial_focus||field==="kling"||field==="sora")&&Object.values(objContext).some(Boolean);
  const confidence=confidenceContext(factual);
  const confidenceApplied=isVideoPlatform&&Object.values(confidence).some(v=>v>0);
  const speechConfidenceApplied=isVideoPlatform&&speechConfidence.confidence_speech>0;
  const speechLanguageApplied=isVideoPlatform&&(factual?.speech_present===true||String(factual?.speech_present).trim().toLowerCase()==="true")&&Boolean(speechLanguage.speech_language);
  const screen=screenContext(factual);
  const screenApplied=isVideoPlatform&&platformProfile.workflow_focus&&Object.values(screen).some(Boolean);
  const workflowDomain=workflowDomainContext(factual);
  const workflowDomainApplied=isVideoPlatform&&platformProfile.workflow_focus&&Boolean(workflowDomain.workflow_domain);
  const cameraGrammar=generateCameraLanguage(factual,"video");
  const motionUnknown=motionUnknownFromFacts(factual);
  const stage1CameraMotion=cleanFact(factual?.camera_motion).toLowerCase();
  const cameraStatic=/^(static|none|none visible|not visible|not enough evidence|locked-off|locked off)$/.test(stage1CameraMotion);
  const grounded=groundedFactSummary(factual);
  const promptProfile=loadPromptProfile(field);
  const referencePattern=isVideoPlatform ? loadReferencePattern(field) : null;
  const targetWords=referencePatternTargetWords(referencePattern,promptProfile,field);
  if(isVideoPlatform) {
    console.log("[reference-aware writer]");
    console.log(JSON.stringify({
      platform:field,
      patternFile:referencePattern?.patternFile||"",
      targetWords,
    },null,2));
  }
  const motionRule=motionUnknown
    ? "Motion evidence is absent or unavailable. Use static composition, observational framing, locked-off composition, composed stillness, portrait framing, or still environment. Do not write breathing, blinking, hair movement, posture shifts, body movement, handheld drift, push-ins, slider movement, tracking, orbit, or invented camera motion."
    : "Use only motion or camera behavior supported by STAGE_1_FACTS, MOTION_SYNTHESIS, or CAMERA_GRAMMAR.";
  const cameraRule=cameraStatic
    ? "Stage 1 camera_motion is static. Do not generate slider movement, push-in, tracking shot, orbit, or camera drift. Use static camera, locked-off framing, or observational composition."
    : "Only generate camera movement when Stage 1 camera_motion contains actual motion evidence.";
  const platformTemplate=isVideoPlatform ? buildPlatformPromptTemplate(field,factual,platformProfile,{
    semanticApplied,
    semanticContext,
    objectApplied,
    objectContext:objContext,
    screenApplied,
    screen,
    workflowDomainApplied,
    workflowDomain,
    motionUnknown,
    cameraStatic,
  }) : null;
  if(platformTemplate) {
    console.log("[prompt template]");
    console.log(JSON.stringify({platform:field,template:platformTemplate},null,2));
    console.log("[platform writing]");
    console.log(JSON.stringify({platform:field,styleApplied:platformTemplate.writing_rules},null,2));
  }
  const directorPrompt=platformTemplate ? buildDirectorPrompt(field,factual,platformProfile,platformTemplate) : null;
  if(directorPrompt) {
    console.log("[director prompt]");
    console.log(JSON.stringify({
      platform:field,
      style:directorPrompt.style,
      words:String(directorPrompt.composition||"").split(/\s+/).filter(Boolean).length,
    },null,2));
  }
  const shotPlan=isVideoPlatform ? buildShotPlan(factual,cameraGrammar,microMotion) : null;
  const shotPlanOrder=isVideoPlatform ? shotPlanOrderForPlatform(field) : [];
  if(shotPlan) {
    console.log("[shot plan]");
    console.log(JSON.stringify(shotPlan,null,2));
  }
  const promptSlots=shotPlan ? buildPromptSlots(field,shotPlan,factual) : null;
  if(promptSlots) {
    console.log("[prompt slots]");
    console.log(JSON.stringify({
      platform:field,
      slotOrder:promptSlots.slotOrder,
      populatedSlots:promptSlots.populatedSlots,
    },null,2));
    console.log("[slot assembly]");
    console.log(JSON.stringify({platform:field,enforced:true},null,2));
  }
  const directorBrief=isVideoPlatform ? buildDirectorBrief(factual,cameraGrammar,microMotion,shotPlan) : null;
  const audioPromptGuidance=isVideoPlatform ? buildAudioPromptGuidance(field,directorBrief) : "";
  if(isVideoPlatform) {
    console.log("[audio prompt integration]");
    console.log(JSON.stringify({
      platform:field,
      applied:Boolean(audioPromptGuidance),
      audio_type:directorBrief?.audio_type||"none",
    },null,2));
  }
  const promptComponents=buildPromptComponents(factual);
  const briefComponents=directorBrief ? {...promptComponents,...directorBrief} : promptComponents;
  console.log("[prompt components]");
  console.log(JSON.stringify(briefComponents,null,2));
  const profileAssembly=assemblePromptFromProfile(field,promptProfile,briefComponents);
  const platformWriterOutput=writePlatformStyle(field,promptProfile,briefComponents,profileAssembly,directorBrief);
  const compactContext=buildStage2Context(factual,shotPlan,promptSlots,{...briefComponents,profile_assembly:profileAssembly,platform_writer:platformWriterOutput},directorBrief);
  const speechLanguagePromptValue=cleanFact(compactContext.speech_language);
  const speechLanguageSection=speechLanguagePromptValue
    ? JSON.stringify({speech_language:speechLanguagePromptValue})
    : "none";
  if(speechLanguagePromptValue&&speechLanguageSection==="none") {
    console.error("[speech language mismatch]",{
      compactContext:speechLanguagePromptValue,
      promptField:speechLanguageSection,
    });
  }
  console.log("[speech language propagation]");
  console.log(JSON.stringify({
    detected:speechLanguage.speech_language,
    promptContext:compactContext.speech_language||"",
    propagated:Boolean(speechLanguagePromptValue),
  },null,2));
  const compactTemplate=platformTemplate ? {
    source:platformTemplate.source,
    order:platformTemplate.order,
    style:platformTemplate.style,
    structure:platformTemplate.structure,
    emphasis_scores:platformProfile.emphasis_scores||{},
    ideal_length:platformProfile.ideal_length||{},
    reference_pattern:referencePattern ? {
      avgWords:referencePattern.avgWords,
      avgSentences:referencePattern.avgSentences,
      cameraFrequency:referencePattern.cameraFrequency,
      motionFrequency:referencePattern.motionFrequency,
      lightingFrequency:referencePattern.lightingFrequency,
      audioFrequency:referencePattern.audioFrequency,
      dialogueFrequency:referencePattern.dialogueFrequency,
      atmosphereFrequency:referencePattern.atmosphereFrequency,
      temporalFrequency:referencePattern.temporalFrequency,
      commonStructures:referencePattern.commonStructures||[],
    } : null,
    writing_rules:platformTemplate.writing_rules,
  } : null;
  const compactDirector=directorPrompt ? {
    style:directorPrompt.style,
    structure:directorPrompt.structure,
    composition:directorPrompt.composition,
  } : null;
  const slotOnlyMode=process.env.VP_SLOT_ONLY_MODE==="1";
  const slotOnlyPrompt=`Generate the ${field.toUpperCase()} field as directed video instructions using only the five sections below.

PLATFORM_TEMPLATE:
${JSON.stringify(compactTemplate)}

PLATFORM_PROFILE:
${JSON.stringify(promptProfile)}

REFERENCE_PATTERN:
${JSON.stringify(referencePattern)}

DIRECTOR_BRIEF:
${JSON.stringify(directorBrief)}

AUDIO_GUIDANCE:
${audioPromptGuidance||"none"}

DIRECTOR_PROMPT:
${JSON.stringify(compactDirector)}

SHOT_PLAN:
${JSON.stringify({order:shotPlanOrder,plan:shotPlan})}

PROMPT_SLOTS:
${JSON.stringify(promptSlots)}

Return ONLY valid JSON: {"${field}":"${targetWords}."}`;
  const legacyLengthEstimate=[
    "STAGE_1_FACTS", JSON.stringify(stage2Facts),
    "PLATFORM_PROFILE", JSON.stringify(platformProfile),
    "PLATFORM_TEMPLATE", JSON.stringify(platformTemplate),
    "REFERENCE_PATTERN", JSON.stringify(referencePattern),
    "DIRECTOR_BRIEF", JSON.stringify(directorBrief),
    "AUDIO_GUIDANCE", audioPromptGuidance,
    "DIRECTOR_PROMPT", JSON.stringify(directorPrompt),
    "SHOT_PLAN", JSON.stringify({order:shotPlanOrder,plan:shotPlan}),
    "PROMPT_SLOTS", JSON.stringify(promptSlots),
    "MOTION_SYNTHESIS", JSON.stringify(motionFacts),
    "GROUNDED_MOTION_FACTS", JSON.stringify(groundedMotion),
    "MICRO_MOTION_LAYER", JSON.stringify(microMotion),
    "OCR_TOPIC", JSON.stringify(ocrContext),
    "SPOKEN_TOPIC", JSON.stringify(speechContext),
    "SPEECH_LANGUAGE", JSON.stringify(speechLanguage),
    "SEMANTIC_SCENE", JSON.stringify(semanticContext),
    "REEL_TYPE", JSON.stringify(reelType),
    "OBJECT_CONTEXT", JSON.stringify(objContext),
    "CONFIDENCE", JSON.stringify(confidence),
    "SPEECH_CONFIDENCE", JSON.stringify(speechConfidence),
    "SCREEN_CONTEXT", JSON.stringify(screen),
    "WORKFLOW_DOMAIN", JSON.stringify(workflowDomain),
    "GROUNDING PRIORITY", JSON.stringify(grounded),
    "CAMERA_GRAMMAR", JSON.stringify(cameraGrammar),
    "STYLE", style,
    "PLATFORM DIRECTIONS", instructions,
  ].join("\n").length+3600;
  const compactPrompt=`Generate the ${field.toUpperCase()} field from the director brief and enforced slot plan.

PLATFORM_TEMPLATE:
${JSON.stringify(compactTemplate)}

PLATFORM_PROFILE:
${JSON.stringify(promptProfile)}

REFERENCE_PATTERN:
${JSON.stringify(referencePattern)}

DIRECTOR_BRIEF:
${JSON.stringify(directorBrief)}

AUDIO_GUIDANCE:
${audioPromptGuidance||"none"}

DIRECTOR_PROMPT:
${JSON.stringify(compactDirector)}

SHOT_PLAN:
${JSON.stringify({order:shotPlanOrder,plan:shotPlan})}

PROMPT_SLOTS:
${JSON.stringify(promptSlots)}

COMPACT_CONTEXT:
${JSON.stringify(compactContext)}

SPEECH_LANGUAGE:
${speechLanguageSection}

GROUNDING RULES:
- Use DIRECTOR_BRIEF as the primary source. Treat it as the platform-neutral shot brief distilled from facts.
- Use PLATFORM_PROFILE for preferred structure, writing style, emphasis scores, and ideal length.
- Use REFERENCE_PATTERN only as aggregate style guidance. Do not copy examples, because no examples are provided.
- Use AUDIO_GUIDANCE exactly as the audio direction for this platform when present.
- Match REFERENCE_PATTERN.avgWords and REFERENCE_PATTERN.avgSentences as closely as possible while preserving grounded facts.
- Match the relative density implied by REFERENCE_PATTERN camera, motion, lighting, audio, dialogue, atmosphere, and temporal frequencies.
- Follow one of REFERENCE_PATTERN.commonStructures when it fits the director brief, but do not force unsupported audio, dialogue, camera movement, or motion.
- Use COMPACT_CONTEXT.prompt_components.profile_assembly as the profile-based assembly guide. It was assembled from profile.preferred_structure and reusable grounded director brief components.
- Use COMPACT_CONTEXT.prompt_components.platform_writer to transform DIRECTOR_BRIEF according to profile.writing_style. Do not change grounded facts.
- You MUST construct the prompt from PROMPT_SLOTS.slotOrder in the exact order shown.
- Every sentence must be derived from DIRECTOR_BRIEF, PROMPT_SLOTS.populatedSlots, or COMPACT_CONTEXT.shot_plan.
- Do not include raw extraction syntax, metadata lists, or comma-separated attribute dumps.
- Do not introduce facts outside DIRECTOR_BRIEF, COMPACT_CONTEXT, PROMPT_SLOTS, DIRECTOR_PROMPT, or PLATFORM_TEMPLATE.
- Platform writers must create generation-oriented shot instructions, not descriptive reconstruction prompts.
- If a slot value is empty, omit it.
- Do not summarize the scene independently.
- Write generation instructions, not a scene summary.
- Prefer active direction: focus settles on, camera follows, attention shifts, motion unfolds, framing isolates.
- Avoid descriptive summary phrases: shows, depicts, contains, features, illustrates, captures unless required by visible OCR text.
- Visible motion comes before supplemental micro-motion.
- Camera behavior must read as direction, not as a label.
- No ARRI Alexa, spherical 50mm lens, film-grade color, teal-orange grade, creamy bokeh, ultra-realistic commercial aesthetic, masterpiece, award-winning.
- If SPEECH_LANGUAGE exists and confidence_speech is at least 0.5, mention speaking language only when visually appropriate, such as "Hindi-speaking presenter" or "presenter speaking Hindi". Do not invent language when detection confidence is low.
- Audio rules: if DIRECTOR_BRIEF.audio_type is "speech", include speaking guidance; if "music", include music guidance only; if "speech_and_music", include both speaking and music guidance; if "ambient_audio", include ambient sound guidance; if "none", omit audio instructions.
- Never add dialogue when DIRECTOR_BRIEF.audio_type is "music", "ambient_audio", or "none".
- Return only valid JSON: {"${field}":"${targetWords}."}`;
  const finalPrompt=slotOnlyMode ? slotOnlyPrompt : compactPrompt;
  const assemblyStatus=inspectStage2Assembly(finalPrompt);
  console.log("[stage2 active modules]");
  console.log(JSON.stringify({
    directorBrief:Boolean(directorBrief)&&assemblyStatus.includesDirectorBrief,
    directorPrompt:Boolean(compactDirector)&&assemblyStatus.includesDirectorPrompt,
    promptSlots:Boolean(promptSlots)&&assemblyStatus.includesPromptSlots,
    platformTemplate:Boolean(compactTemplate)&&assemblyStatus.includesPlatformTemplate,
    platformProfile:Boolean(promptProfile)&&assemblyStatus.includesPlatformProfile,
    shotPlan:Boolean(shotPlan)&&assemblyStatus.includesShotPlan,
    audioGuidance:assemblyStatus.includesAudioGuidance,
    refinement:promptRefinementEnabled()||languageRefinementEnabled(),
    optimization:feedbackOptimizationEnabled(),
    guardrails:promptGuardrailsEnabled(),
  },null,2));
  console.log("[compressed prompt]");
  console.log(JSON.stringify({
    platform:field,
    oldLength:legacyLengthEstimate,
    newLength:finalPrompt.length,
    reductionPercent:Math.round((1-(finalPrompt.length/Math.max(legacyLengthEstimate,1)))*100),
  },null,2));
  console.log("[slot-only mode]");
  console.log(JSON.stringify({
    enabled:slotOnlyMode,
    platform:field,
    promptLength:finalPrompt.length,
    ...(slotOnlyMode ? {} : {reminder:"slot-only experiment inactive"}),
  },null,2));
  if(field==="veo") {
    const oldVeoPrompt=buildLegacyPlatformPrompt(field,factual,stylePreset,instructions,generationMode);
    console.log("[veo prompt comparison]");
    console.log(JSON.stringify({
      oldPromptPreview:oldVeoPrompt.slice(0,700),
      newPromptPreview:finalPrompt.slice(0,700),
      oldLength:oldVeoPrompt.length,
      newLength:finalPrompt.length,
    },null,2));
  }
  promptAssemblyContextCache.set(field,{
    brief:directorBrief,
    profile:promptProfile,
    pattern:referencePattern,
    factual,
    stylePreset,
    instructions,
    generationMode,
  });
  return finalPrompt;
}

async function generatePlatformField({field,label,systemPrompt,prompt,dbg}) {
  const started=Date.now();
  let lastErr;
  for(let attempt=1;attempt<=2;attempt++) {
    try {
      let activePrompt=prompt;
      let promptContext=promptAssemblyContextCache.get(field)||{};
      let assembly=inspectStage2Assembly(activePrompt);
      if(isModernVideoPlatform(field)&&!stage2AssemblyReady(activePrompt)) {
        console.error("[stage2 assembly failure]");
        console.error(JSON.stringify({
          platform:field,
          ...assembly,
        },null,2));
        if(promptContext.factual) {
          activePrompt=buildPlatformPrompt(
            field,
            promptContext.factual,
            promptContext.stylePreset,
            promptContext.instructions||"",
            promptContext.generationMode||"cinematic"
          );
          promptContext=promptAssemblyContextCache.get(field)||promptContext;
          assembly=inspectStage2Assembly(activePrompt);
        }
        if(!stage2AssemblyReady(activePrompt)) {
          throw new Error(`${field}: Stage2 assembly missing required modern modules`);
        }
      }
      console.log("[stage2 final prompt]");
      console.log(JSON.stringify({
        platform:field,
        ...assembly,
        promptLength:activePrompt.length,
        promptPreview:activePrompt.slice(0,900),
      },null,2));
      const raw=await callAI(activePrompt,systemPrompt,[],dbg);
      dbg.log(label,"Response",{attempt,chars:raw.length,preview:raw.slice(0,200)});
      const parsed=extractJSON(raw,label);
      let value=String(parsed?.[field]||"").trim();
      const draftPrompt=value;
      value=refinePromptIfEnabled(field,value,promptContext);
      if(!promptRefinementEnabled()) value=critiqueAndMaybeRewritePrompt(field,value,promptContext);
      value=refinePromptLanguageIfEnabled(field,value,promptContext.profile||loadPromptProfile(field));
      const refinedPrompt=value;
      const optimizedPrompt=applyPromptOptimization(field,promptContext.factual?.reel_type||"other",value);
      const translatedPrompt=translateToGenerativeVisualLanguage(field,{
        ...(promptContext.factual||{}),
        ...(promptContext.brief||{}),
      },optimizedPrompt);
      value=applyPromptGuardrails(field,{
        draft_prompt:draftPrompt,
        refined_prompt:refinedPrompt,
        optimized_prompt:translatedPrompt,
      });
      promptAssemblyContextCache.delete(field);
      if(value.length<20) throw new Error(`${field}: empty or too short`);
      console.log(`[${label} generation ms] ${Date.now()-started}`);
      return value;
    } catch(e) {
      lastErr=e;
      dbg.err(label,`Attempt ${attempt} rejected`,e);
      if(attempt<2) dbg.log(label,"Retrying generation once with same grounded inputs");
    }
  }
  console.log(`[${label} generation ms] ${Date.now()-started}`);
  throw lastErr || new Error(`${label} generation failed`);
}

function generateRunwayPrompt(factual,stylePreset,dbg,generationMode="cinematic") {
  return generatePlatformField({
    field:"runway",
    label:"Runway",
    systemPrompt:RUNWAY_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("runway",factual,stylePreset,`RUNWAY focus:
- framing first
- composition and subject placement
- camera choreography
- lens behavior and depth
- cinematic commercial direction

Opening style examples:
"Medium portrait framing."
"The lens isolates the subject..."
"A controlled slider move advances..."

Subject description should not be the opening sentence.`,generationMode),
  });
}

function generateSoraPrompt(factual,stylePreset,dbg,generationMode="cinematic") {
  return generatePlatformField({
    field:"sora",
    label:"Sora",
    systemPrompt:SORA_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("sora",factual,stylePreset,`SORA focus:
- environment and world detail
- atmosphere
- spatial depth
- foreground/background layering
- relationships between visible objects and surfaces

Opening style examples:
"Within a softly lit interior..."
"Foreground and background layers create depth..."
"The visible forms recede into shadow..."`,generationMode),
  });
}

function generateKlingPrompt(factual,stylePreset,dbg,generationMode="cinematic") {
  return generatePlatformField({
    field:"kling",
    label:"Kling",
    systemPrompt:KLING_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("kling",factual,stylePreset,`KLING focus:
- expression
- posture
- gaze
- body language
- character performance and grounded human motion

Opening style examples:
"She lowers her gaze..."
"A contemplative expression settles..."
"Her posture remains relaxed..."`,generationMode),
  });
}

function generateVeoPrompt(factual,stylePreset,dbg,generationMode="cinematic") {
  return generatePlatformField({
    field:"veo",
    label:"Veo",
    systemPrompt:VEO_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("veo",factual,stylePreset,`VEO focus:
- realism
- physical lighting and shadow behavior
- material response
- environmental interaction
- believable motion only when grounded

Opening style examples:
"Warm directional light strikes the fabric..."
"Long shadows stretch across the wall..."
"The visible texture catches highlights..."`,generationMode),
  });
}

function generatePikaPrompt(factual,stylePreset,dbg,generationMode="cinematic") {
  return generatePlatformField({
    field:"pika",
    label:"Pika",
    systemPrompt:PIKA_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("pika",factual,stylePreset,`PIKA focus:
- concise motion-first prompt
- strongest grounded visual action first
- compact wording
- minimal cinematic filler

Opening style examples:
"Slow push-in. Soft hair movement."
"Static portrait. Hard side light."
"Locked-off frame. Strong shadow shape."`,generationMode),
  });
}

function generateKeyframePrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"keyframe",
    label:"Keyframe",
    systemPrompt:KEYFRAME_SYSTEM,
    dbg,
    prompt:buildPlatformPrompt("keyframe",factual,stylePreset,`KEYFRAME focus:
- pure still image description
- visible subject or object details
- composition
- lighting
- environment and materials
- lens feel

Do not include motion, camera movement, scene progression, or video direction.`),
  });
}

function buildVideoPromptSharedFields(factual,stylePreset) {
  const p=getPreset(stylePreset||"cinematic");
  const motionFacts=generateImageMotionFacts(factual);
  const cameraGrammar=generateCameraLanguage(factual,"video");
  const motionUnknown=motionUnknownFromFacts(factual);
  const motionScore=calculateMotionScore({
    subjectMotion:motionFacts.subjectMotion,
    environmentalMotion:motionFacts.environmentalMotion,
    cameraMotion:motionUnknown ? "" : cameraGrammar.cameraMotion,
    sceneProgression:cleanFact(factual?.visible_motion_cues),
  });
  const lighting=cleanFact(factual?.lighting)||"grounded lighting";
  const lens=groundedCompositionText(factual,cameraGrammar.lensBehavior);
  const environment=cleanFact(factual?.environment)||"visible environment";

  return {
    negative:`Avoid invented clothing, inaccurate colors, extra limbs, distorted faces, ungrounded props, scene changes, flicker, and generic AI gloss.`,
    camera_spec:`${cameraGrammar.framing}, ${lens}, ${motionUnknown ? "locked-off static composition" : cameraGrammar.cameraMotion}`,
    motion_score:motionUnknown ? 10 : motionScore,
    scene_progression:motionUnknown
      ? "Static composition holds on the grounded visual details without invented movement."
      : `Scene progression remains grounded in ${cleanFact(factual?.visible_motion_cues)||"the visible motion cues"}.`,
    camera_motion:motionUnknown ? "locked-off composition with static framing" : cameraGrammar.cameraMotion,
    environmental_motion:motionFacts.environmentalMotion,
    style_tags:[
      p.label,
      "grounded realism",
      lighting,
      environment,
      lens,
    ].map(cleanStyleText).filter(Boolean).slice(0,5),
  };
}

function containsCameraLanguage(prompt) {
  return /\b(static camera|locked-off|locked off|observational framing|static framing|locked-off composition|portrait framing|shallow depth of field)\b/i.test(String(prompt||""));
}

function ensureCameraLanguage(prompt,factual) {
  const text=String(prompt||"").trim();
  const cameraMotion=cleanFact(factual?.camera_motion).toLowerCase();
  const cameraStatic=/^(static|none|none visible|not visible|not enough evidence|locked-off|locked off|)$/.test(cameraMotion);
  const required="static camera with locked-off observational framing";
  const detectedCameraLanguage=containsCameraLanguage(text);
  if(!cameraStatic||detectedCameraLanguage) {
    return {prompt:text,addedCameraLanguage:false,detectedCameraLanguage};
  }
  return {
    prompt:`${text} The shot uses ${required}.`,
    addedCameraLanguage:true,
    detectedCameraLanguage,
  };
}

function groundedLengthDetails(factual) {
  return [
    cleanFact(factual?.lighting) ? `Lighting remains grounded in ${cleanFact(factual.lighting)}.` : "",
    cleanFact(factual?.environment) ? `The environment remains ${cleanFact(factual.environment)}.` : "",
    cleanFact(factual?.surfaces) ? `Visible surfaces include ${cleanFact(factual.surfaces)}.` : "",
    groundedCompositionText(factual,"") ? `Composition uses ${groundedCompositionText(factual,"")}.` : "",
    cleanFact(factual?.color_palette) ? `The color palette includes ${cleanFact(factual.color_palette)}.` : "",
    [cleanFact(factual?.clothing_top),cleanFact(factual?.clothing_bottom),cleanFact(factual?.footwear),cleanFact(factual?.accessories)]
      .filter(usableFact).join("; ")
      ? `Clothing and visible textures include ${[cleanFact(factual?.clothing_top),cleanFact(factual?.clothing_bottom),cleanFact(factual?.footwear),cleanFact(factual?.accessories)].filter(usableFact).join("; ")}.`
      : "",
  ].filter(Boolean);
}

function ensureMinimumPromptLength(prompt,factual) {
  let text=String(prompt||"").trim();
  const details=groundedLengthDetails(factual);
  let i=0;
  while(wordCount(text)<60&&details.length&&i<details.length*2) {
    text=`${text} ${details[i%details.length]}`.trim();
    i++;
  }
  return text;
}

function repairVideoPromptForValidation(platform,prompt,factual) {
  const originalWords=wordCount(prompt);
  const cameraResult=ensureCameraLanguage(prompt,factual);
  const finalPrompt=ensureMinimumPromptLength(cameraResult.prompt,factual);
  const finalWords=wordCount(finalPrompt);
  console.log("[prompt repair]");
  console.log(JSON.stringify({
    platform,
    addedCameraLanguage:cameraResult.addedCameraLanguage,
    originalWords,
    finalWords,
  },null,2));
  console.log("[camera dedupe]");
  console.log(JSON.stringify({
    platform,
    detectedCameraLanguage:cameraResult.detectedCameraLanguage,
    appended:cameraResult.addedCameraLanguage,
  },null,2));
  return finalPrompt;
}

function textSimilarity(a,b) {
  const words=text=>new Set(String(text||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3));
  const setA=words(a);
  const setB=words(b);
  if(!setA.size&&!setB.size) return 1;
  const intersection=[...setA].filter(w=>setB.has(w)).length;
  const union=new Set([...setA,...setB]).size||1;
  return Math.round((intersection/union)*100)/100;
}

function logPlatformSimilarity(prompts) {
  const fields=["runway","sora","kling","veo","pika"];
  for(let i=0;i<fields.length;i++) {
    for(let j=i+1;j<fields.length;j++) {
      const pair=[fields[i],fields[j]];
      const similarity=textSimilarity(prompts[pair[0]],prompts[pair[1]]);
      if(similarity>=0.72) {
        console.log("[platform similarity]");
        console.log(JSON.stringify({pair,similarity,warning:true},null,2));
      }
    }
  }
}

function clampQualityScore(value) {
  return Math.max(0,Math.min(10,Math.round(Number(value)||0)));
}

function profileKeywordSet(profile) {
  const style=profile?.writing_style||{};
  const values=[
    ...(Array.isArray(profile?.preferred_structure) ? profile.preferred_structure : []),
    ...Object.keys(profile?.emphasis_scores||{}),
    ...(Array.isArray(profile?.recommended_elements) ? profile.recommended_elements : []),
    ...(Array.isArray(style?.tone) ? style.tone : []),
    ...(Array.isArray(style?.sentence_structure) ? style.sentence_structure : []),
    ...(Array.isArray(style?.preferred_wording) ? style.preferred_wording : []),
  ];
  return new Set(values
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g," ")
    .split(/\s+/)
    .map(v=>v.trim())
    .filter(v=>v.length>3));
}

function scorePromptQuality(platform,prompt,profile) {
  const text=String(prompt||"").trim();
  const lower=text.toLowerCase();
  const words=wordCount(text);
  const concreteSubject=/\b(creator|presenter|subject|woman|man|person|hands|product|package|label|brand|food|bread|spread|rider|horse|doctor|nurse|professional|screen|interface|app|website)\b/i.test(text);
  const genericOnlyOpening=/^(a|an|the)\s+(person|subject|object|item|thing)\b/i.test(text);
  const actionPhrase=detectAbstractActionPhrase(text);
  const actionVerb=/\b(opens?|opening|presents?|presenting|holds?|holding|lowers?|lowering|raises?|raising|turns?|turning|moves?|moving|speaks?|speaking|explains?|explaining|clicks?|clicking|types?|typing|prepares?|preparing)\b/i.test(text);
  const staticComposition=hasStaticCompositionLanguage(text);
  const cameraTerms=/\b(camera|framing|frame|composition|lens|depth of field|close-up|medium|wide|locked-off|locked off)\b/i.test(text);
  const profileTerms=[...profileKeywordSet(profile)];
  const profileMatches=profileTerms.filter(term=>lower.includes(term)).length;
  const profileDenominator=Math.max(1,Math.min(profileTerms.length,20));
  const bannedFillerMatches=lower.match(/\b(arri alexa|spherical 50mm lens|film-grade color|teal-orange grade|creamy bokeh|ultra-realistic commercial aesthetic|masterpiece|award-winning)\b/g)||[];
  const speculativeMatches=lower.match(/\b(probably|maybe|seems to|appears to|ethnicity|caucasian|asian|african)\b/g)||[];

  const scores={
    subjectClarity:clampQualityScore((words>=40?3:words>=20?2:1)+(concreteSubject?5:1)+(genericOnlyOpening?-2:2)),
    actionClarity:clampQualityScore((actionPhrase||actionVerb)?9:(staticComposition?6:2)),
    cameraClarity:clampQualityScore((hasCameraLanguage(text)?6:1)+(cameraTerms?3:0)+(lower.includes("camera")?1:0)),
    motionClarity:clampQualityScore((hasMotionLanguage(text)?8:(staticComposition?6:2))+(lower.includes("while")||lower.includes("gradually")?1:0)),
    platformAlignment:clampQualityScore((profileMatches/profileDenominator)*10),
    hallucinationRisk:clampQualityScore((bannedFillerMatches.length*3)+(speculativeMatches.length*2)+(genericOnlyOpening?1:0)),
  };

  console.log("[prompt quality]");
  console.log(JSON.stringify({
    platform,
    scores,
  },null,2));
  return scores;
}

function critiquePrompt(platform, prompt, brief={}, profile=null) {
  const text=String(prompt||"").trim();
  const lower=text.toLowerCase();
  const profileTerms=[...profileKeywordSet(profile)];
  const matchedProfileTerms=profileTerms.filter(term=>lower.includes(term)).length;
  const profileDenominator=Math.max(1,Math.min(profileTerms.length,20));
  const speechExpected=Boolean(brief?.dialogue||brief?.audio);
  const audioMentioned=/\b(audio|speech|speaks|speaker|voice|dialogue|music|sound|says|narration)\b/i.test(text);
  const concreteSubject=usableFact(brief?.subject)&&lower.includes(cleanFact(brief.subject).split(/\s+/)[0]?.toLowerCase()||"");
  const actionExpected=usableFact(brief?.action);
  const actionPresent=hasMotionLanguage(text)||detectAbstractActionPhrase(text)||(!actionExpected&&hasStaticCompositionLanguage(text));
  const cameraPresent=hasCameraLanguage(text);
  const motionExpected=usableFact(brief?.motion)||usableFact(brief?.action);
  const motionPresent=hasMotionLanguage(text)||(!motionExpected&&hasStaticCompositionLanguage(text));
  const generationReady=wordCount(text)>=45&&cameraPresent&&concreteSubject;
  const score={
    subjectClarity:clampQualityScore(concreteSubject?9:(/\b(subject|person|product|creator|presenter|object)\b/i.test(text)?6:3)),
    actionClarity:clampQualityScore(actionPresent?9:(actionExpected?3:7)),
    cameraClarity:clampQualityScore(cameraPresent?9:3),
    motionClarity:clampQualityScore(motionPresent?9:(motionExpected?3:7)),
    audioClarity:clampQualityScore(!speechExpected?10:(audioMentioned?9:3)),
    platformAlignment:clampQualityScore((matchedProfileTerms/profileDenominator)*10),
    generationReadiness:clampQualityScore(generationReady?9:(wordCount(text)>=35?6:3)),
  };
  score.overall=clampQualityScore((
    score.subjectClarity+
    score.actionClarity+
    score.cameraClarity+
    score.motionClarity+
    score.audioClarity+
    score.platformAlignment+
    score.generationReadiness
  )/7);

  const weaknesses=[];
  const strengths=[];
  if(score.subjectClarity<8) weaknesses.push("main subject is not immediately clear"); else strengths.push("clear subject");
  if(score.actionClarity<8) weaknesses.push("action or stillness needs clearer direction"); else strengths.push("clear action direction");
  if(score.cameraClarity<8) weaknesses.push("camera or framing language is weak"); else strengths.push("clear camera direction");
  if(score.motionClarity<8) weaknesses.push("motion wording is weak or missing"); else strengths.push("grounded motion language");
  if(score.audioClarity<8) weaknesses.push("speech or audio context is missing"); else strengths.push("audio handling is appropriate");
  if(score.platformAlignment<8) weaknesses.push("platform profile alignment is weak"); else strengths.push("platform style is represented");
  if(score.generationReadiness<8) weaknesses.push("prompt may read as description instead of generation direction"); else strengths.push("generation-ready wording");

  const critique={strengths,weaknesses,score};
  console.log("[prompt critique]");
  console.log(JSON.stringify({
    platform,
    score,
    weaknesses,
  },null,2));
  return critique;
}

function sentenceFromBrief(label,value) {
  const text=cleanFact(value);
  if(!usableFact(text)) return "";
  return `${label} ${text}.`;
}

function rewritePromptFromCritique(platform, prompt, brief={}, profile=null, critique=null, pattern=null) {
  const before=String(prompt||"").trim();
  const parts=[];
  const structure=Array.isArray(profile?.preferred_structure) ? profile.preferred_structure.join(", ") : "";
  const platformName=String(platform||"").toUpperCase();
  if(usableFact(brief?.subject)) parts.push(sentenceFromBrief(`${platformName} shot direction: focus begins on`,brief.subject));
  if(usableFact(brief?.action)) parts.push(sentenceFromBrief("Action unfolds as",brief.action));
  else if(usableFact(brief?.generation_intent)) parts.push(sentenceFromBrief("The moment holds for",brief.generation_intent));
  if(usableFact(brief?.camera)) parts.push(sentenceFromBrief("Camera direction:",brief.camera));
  if(usableFact(brief?.motion)) parts.push(sentenceFromBrief("Grounded motion:",brief.motion));
  if(usableFact(brief?.lighting)) parts.push(sentenceFromBrief("Lighting:",brief.lighting));
  if(usableFact(brief?.environment)) parts.push(sentenceFromBrief("Environment:",brief.environment));
  if(usableFact(brief?.mood)) parts.push(sentenceFromBrief("Mood:",brief.mood));
  if(usableFact(brief?.visual_goal)) parts.push(sentenceFromBrief("Visual goal:",brief.visual_goal));
  if(usableFact(brief?.audio)&&!/\bspeech present but not reliable/i.test(brief.audio)) {
    parts.push(sentenceFromBrief("Audio guidance:",brief.audio));
  }
  if(structure) parts.push(`Shape the prompt for ${platformName} with ${structure} ordering.`);
  const rewritten=parts.join(" ").replace(/\s+/g," ").trim() || before;
  const improved=rewritten&&rewritten!==before;
  console.log("[prompt rewrite]");
  console.log(JSON.stringify({
    platform,
    beforeWords:wordCount(before),
    afterWords:wordCount(rewritten),
    improved,
  },null,2));
  return improved ? rewritten : before;
}

function critiqueAndMaybeRewritePrompt(platform, prompt, context={}) {
  if(!promptCriticEnabled()||!["runway","sora","kling","veo","pika"].includes(String(platform||"").toLowerCase())) return prompt;
  const brief=context.brief||{};
  const profile=context.profile||null;
  const pattern=context.pattern||null;
  const critique=critiquePrompt(platform,prompt,brief,profile);
  if(critique.score.overall<8||critique.score.platformAlignment<8) {
    return rewritePromptFromCritique(platform,prompt,brief,profile,critique,pattern);
  }
  console.log("[prompt rewrite]");
  console.log(JSON.stringify({
    platform,
    beforeWords:wordCount(prompt),
    afterWords:wordCount(prompt),
    improved:false,
  },null,2));
  return prompt;
}

function earlySubjectMention(prompt, subject) {
  const text=String(prompt||"").toLowerCase().split(/\s+/).slice(0,18).join(" ");
  const firstSubjectWord=cleanFact(subject).split(/\s+/).find(w=>w.length>3);
  return Boolean(firstSubjectWord&&text.includes(firstSubjectWord.toLowerCase()));
}

function hasGenerationOrientedLanguage(prompt) {
  return /\b(camera frames|lighting shapes|motion unfolds|subject|action|framing|focus|direct|hold|maintain|use|keep|set|frame)\b/i.test(String(prompt||""));
}

function environmentDominates(prompt, environment) {
  const env=cleanFact(environment).toLowerCase();
  if(!env) return false;
  const words=String(prompt||"").toLowerCase().split(/\s+/).filter(Boolean);
  const envWords=env.split(/\s+/).filter(w=>w.length>3);
  if(!words.length||!envWords.length) return false;
  const hits=words.filter(w=>envWords.includes(w.replace(/[^a-z0-9]/g,""))).length;
  return hits/words.length>0.22;
}

function profileLengthScore(prompt, profile) {
  const words=wordCount(prompt);
  const min=Number(profile?.ideal_length?.minimum_words)||20;
  const max=Number(profile?.ideal_length?.maximum_words)||160;
  if(words>=min&&words<=max) return 10;
  if(words<min) return clampQualityScore(10-((min-words)/Math.max(min,1))*10);
  return clampQualityScore(10-((words-max)/Math.max(max,1))*8);
}

function profileAlignmentScore(prompt, profile) {
  const text=String(prompt||"").toLowerCase();
  const terms=[...profileKeywordSet(profile)];
  const denominator=Math.max(1,Math.min(terms.length,18));
  const matched=terms.filter(term=>text.includes(term)).length;
  const lengthScore=profileLengthScore(prompt,profile);
  const avoidHits=(profile?.avoid||[]).filter(rule=>{
    const key=String(rule||"").toLowerCase().split(/\s+/).find(w=>w.length>5);
    return key&&text.includes(key);
  }).length;
  return clampQualityScore(((matched/denominator)*7)+(lengthScore*0.3)-(avoidHits*1.5));
}

function evaluatePromptQuality(platform, prompt, brief={}, profile=null) {
  const text=String(prompt||"").trim();
  const lower=text.toLowerCase();
  const subject=cleanFact(brief?.subject);
  const action=cleanFact(brief?.action);
  const environment=cleanFact(brief?.environment);
  const motion=cleanFact(brief?.motion);
  const audio=cleanFact(brief?.audio);
  const speechExpected=usableFact(brief?.dialogue)||(/\bspeech\b/i.test(audio)&&!/\bnot reliable|low-confidence/i.test(audio));
  const musicExpected=/\bmusic\b/i.test(audio);
  const audioExpected=speechExpected||musicExpected;
  const forbiddenSummary=(lower.match(/\b(shows|depicts|contains|features|illustrates|captures)\b/g)||[]).length;
  const contradictoryMotion=/\bstatic\b/i.test(text)&&/\b(push-in|tracking|orbit|handheld drift|camera moves|slider)\b/i.test(text);

  const scores={
    subjectClarity:clampQualityScore((subject&&lower.includes(subject.split(/\s+/)[0]?.toLowerCase()||"")?6:2)+(earlySubjectMention(text,subject)?4:0)),
    actionClarity:clampQualityScore((action ? (hasMotionLanguage(text)||detectAbstractActionPhrase(text)||lower.includes(action.split(/\s+/)[0]?.toLowerCase()||"") ? 8 : 4) : (hasStaticCompositionLanguage(text)?8:6))+(hasGenerationOrientedLanguage(text)?1:0)-forbiddenSummary),
    cameraClarity:clampQualityScore((hasCameraLanguage(text)?8:3)+(/\bshot|frame|framing|composition|camera\b/i.test(text)?2:0)),
    motionClarity:clampQualityScore((motion ? (hasMotionLanguage(text)?8:4) : (hasStaticCompositionLanguage(text)?8:7))-(contradictoryMotion?4:0)),
    environmentClarity:clampQualityScore((environment&&lower.includes(environment.split(/\s+/).find(w=>w.length>3)?.toLowerCase()||"")?8:4)-(environmentDominates(text,environment)?3:0)),
    audioClarity:clampQualityScore(!audioExpected ? (/\b(dialogue|says|speech|music|soundtrack)\b/i.test(text)?6:10) : (/\b(dialogue|says|speech|speaker|music|soundtrack|audio|voice)\b/i.test(text)?9:3)),
    platformAlignment:profileAlignmentScore(text,profile),
    generationReadiness:clampQualityScore((wordCount(text)>=25?3:1)+(hasGenerationOrientedLanguage(text)?3:0)+(hasCameraLanguage(text)?2:0)+(forbiddenSummary?0:2)),
  };
  scores.overall=clampQualityScore((
    scores.subjectClarity+
    scores.actionClarity+
    scores.cameraClarity+
    scores.motionClarity+
    scores.environmentClarity+
    scores.audioClarity+
    scores.platformAlignment+
    scores.generationReadiness
  )/8);

  const strengths=[];
  const weaknesses=[];
  for(const [key,value] of Object.entries(scores)) {
    if(key==="overall") continue;
    const label=key.replace(/[A-Z]/g,m=>` ${m.toLowerCase()}`);
    if(value>=8) strengths.push(label);
    else weaknesses.push(`${label} below target`);
  }
  if(forbiddenSummary) weaknesses.push("uses descriptive reconstruction verbs");
  if(contradictoryMotion) weaknesses.push("contains contradictory static and moving camera language");

  const evaluation={...scores,strengths,weaknesses};
  console.log("[prompt evaluation]");
  console.log(JSON.stringify({
    platform,
    overall:evaluation.overall,
    weaknesses:evaluation.weaknesses,
  },null,2));
  return evaluation;
}

function rewritePrompt(platform, prompt, brief={}, profile=null, evaluation={}) {
  const platformName=String(platform||"").toUpperCase();
  const structure=Array.isArray(profile?.preferred_structure) ? profile.preferred_structure : [];
  const sectionValue=label=>{
    const key=String(label||"").toLowerCase();
    if(/subject|character|creator/.test(key)) return cleanFact(brief.subject);
    if(/action/.test(key)) return cleanFact(brief.action)||cleanFact(brief.generation_intent);
    if(/camera|framing|composition|cinematography|shot/.test(key)) return cleanFact(brief.camera);
    if(/lighting/.test(key)) return cleanFact(brief.lighting);
    if(/scene|environment|context/.test(key)) return cleanFact(brief.environment);
    if(/motion|transition|temporal/.test(key)) return cleanFact(brief.motion);
    if(/audio|dialogue|sfx|sound/.test(key)) return /\bnot reliable|low-confidence/i.test(cleanFact(brief.audio)) ? "" : cleanFact(brief.audio);
    if(/ambiance|atmosphere|mood|emotion|tone/.test(key)) return cleanFact(brief.mood);
    if(/style|quality|visual/.test(key)) return cleanFact(brief.visual_goal)||cleanFact(brief.generation_intent);
    return "";
  };
  const used=new Set();
  const sentences=[];
  const addSentence=(label,value)=>{
    const text=cleanFact(value);
    if(!usableFact(text)||used.has(label)) return;
    used.add(label);
    if(label==="subject") sentences.push(`${text}.`);
    else if(label==="action") sentences.push(`The subject ${text}.`);
    else if(label==="camera") sentences.push(`Camera frames the shot with ${text}.`);
    else if(label==="lighting") sentences.push(`Lighting shapes the scene with ${text}.`);
    else if(label==="environment") sentences.push(`The environment surrounds the subject with ${text}.`);
    else if(label==="motion") sentences.push(`Motion unfolds through ${text}.`);
    else if(label==="audio") sentences.push(`Audio guidance: ${text}.`);
    else if(label==="mood") sentences.push(`Maintain ${text}.`);
    else if(label==="style") sentences.push(`Visual intent: ${text}.`);
  };

  if(structure.length) {
    for(const label of structure) {
      const key=String(label||"").toLowerCase();
      const value=sectionValue(label);
      if(/subject|character|creator/.test(key)) addSentence("subject",value);
      else if(/action/.test(key)) addSentence("action",value);
      else if(/camera|framing|composition|cinematography|shot/.test(key)) addSentence("camera",value);
      else if(/lighting/.test(key)) addSentence("lighting",value);
      else if(/scene|environment|context/.test(key)) addSentence("environment",value);
      else if(/motion|transition|temporal/.test(key)) addSentence("motion",value);
      else if(/audio|dialogue|sfx|sound/.test(key)) addSentence("audio",value);
      else if(/ambiance|atmosphere|mood|emotion|tone/.test(key)) addSentence("mood",value);
      else if(/style|quality|visual/.test(key)) addSentence("style",value);
    }
  }
  addSentence("subject",brief.subject);
  addSentence("action",brief.action||brief.generation_intent);
  addSentence("camera",brief.camera);
  addSentence("lighting",brief.lighting);
  addSentence("environment",brief.environment);
  addSentence("motion",brief.motion);
  addSentence("audio",/\bnot reliable|low-confidence/i.test(cleanFact(brief.audio)) ? "" : brief.audio);
  addSentence("style",brief.visual_goal||brief.generation_intent);

  const rewritten=sentences.join(" ")
    .replace(/\b(shows|depicts|contains|features|illustrates|captures)\b/gi,"presents")
    .replace(/\s+/g," ")
    .trim() || String(prompt||"").trim();
  return rewritten ? `${rewritten} ${platformName} generation direction, fact-preserving and grounded.`.replace(/\s+/g," ").trim() : prompt;
}

function refinePromptIfEnabled(platform, prompt, context={}) {
  if(!promptRefinementEnabled()||!["runway","sora","kling","veo","pika"].includes(String(platform||"").toLowerCase())) return prompt;
  const brief=context.brief||{};
  const profile=context.profile||loadPromptProfile(platform);
  const beforeEvaluation=evaluatePromptQuality(platform,prompt,brief,profile);
  let finalPrompt=prompt;
  let improved=false;
  let afterEvaluation=beforeEvaluation;
  if(beforeEvaluation.overall<8||beforeEvaluation.platformAlignment<8||beforeEvaluation.generationReadiness<8) {
    finalPrompt=rewritePrompt(platform,prompt,brief,profile,beforeEvaluation);
    afterEvaluation=evaluatePromptQuality(platform,finalPrompt,brief,profile);
    improved=finalPrompt!==prompt;
  }
  console.log("[prompt rewrite]");
  console.log(JSON.stringify({
    platform,
    improved,
    beforeScore:beforeEvaluation.overall,
    afterScore:afterEvaluation.overall,
  },null,2));
  return finalPrompt;
}

async function generateVideoPromptsByPlatform(factual,stylePreset,dbg,generationMode="cinematic") {
  const ocrContext=ocrTopicContext(factual);
  if(ocrContext.applied) {
    console.log("[ocr grounding]");
    console.log(JSON.stringify(ocrContext,null,2));
    dbg.log("ocr grounding","Stage2 OCR topic context",ocrContext);
  }
  const microMotion=buildMicroMotionLayer(factual,generationMode);
  console.log("[micro motion synthesis]");
  console.log(JSON.stringify(microMotion,null,2));
  dbg.log("micro motion synthesis","Stage2 micro-motion layer",microMotion);
  if(["product","food"].includes(microMotion.content_type)) {
    console.log("[product/food motion layer]");
    console.log(JSON.stringify({
      content_type:microMotion.content_type,
      applied:microMotion.applied,
      generated_layer:microMotion.generated_layer,
    },null,2));
    dbg.log("product/food motion layer","Stage2 product/food motion layer",{
      content_type:microMotion.content_type,
      applied:microMotion.applied,
      generated_layer:microMotion.generated_layer,
    });
  }
  const settle=p=>p.then(value=>({ok:true,value})).catch(error=>({ok:false,error}));
  const results=await Promise.all([
    generateRunwayPrompt(factual,stylePreset,dbg,generationMode),
    generateSoraPrompt(factual,stylePreset,dbg,generationMode),
    generateKlingPrompt(factual,stylePreset,dbg,generationMode),
    generateVeoPrompt(factual,stylePreset,dbg,generationMode),
    generatePikaPrompt(factual,stylePreset,dbg,generationMode),
    generateKeyframePrompt(factual,stylePreset,dbg),
  ].map(settle));
  const failed=results.find(r=>!r.ok);
  if(failed) throw failed.error;
  const [runway,sora,kling,veo,pika,keyframe]=results.map(r=>r.value);
  const master_prompt=buildMasterPrompt(factual,stylePreset,generationMode);

  const prompts={
    master_prompt,
    runway,
    sora,
    pika,
    kling,
    veo,
    keyframe,
    ...buildVideoPromptSharedFields(factual,stylePreset),
  };
  for(const platform of ["runway","sora","pika","kling","veo"]) {
    prompts[platform]=repairVideoPromptForValidation(platform,prompts[platform],factual);
  }
  for(const platform of ["runway","sora","pika","kling","veo"]) {
    scorePromptQuality(platform,prompts[platform],promptIntelligenceEnabled() ? loadPromptProfile(platform) : null);
  }
  logPlatformSimilarity(prompts);
  return prompts;
}

async function generateVideoPromptsWithRetry(factual,stylePreset,mediaType,dbg) {
  const generationMode=String(factual?.generation_mode||"cinematic").trim().toLowerCase()==="grounded" ? "grounded" : "cinematic";
  let lastErr;
  for(let attempt=1;attempt<=2;attempt++) {
    try {
      const prompts=await generateVideoPromptsByPlatform(factual,stylePreset,dbg,generationMode);
      logStage2Debug(`platform prompts attempt ${attempt}`,prompts);
      const issues=validatePrompts({factual,prompts},mediaType);
      if(issues.length) {
        logStage2Debug(`validation errors attempt ${attempt}`,issues);
        throw new Error(`Prompt validation failed: ${issues.join("; ")}`);
      }
      return prompts;
    } catch(e) {
      lastErr=e;
      dbg.err("Stage2",`Attempt ${attempt} rejected`,e);
      if(attempt<2) dbg.log("Stage2","Retrying platform generation once with same grounded inputs");
    }
  }
  return diagnostic("Prompt generation incomplete",lastErr?.message||"Stage2 failed",dbg,mediaType);
}

function buildImagePlatformPrompt(field, factual, stylePreset, instructions) {
  const p=getPreset(stylePreset||"cinematic");
  const style=[p.label,cleanStyleText(p.grade),cleanStyleText(p.lens),cleanStyleText(p.suffix)].filter(Boolean).join(" | ");
  const cameraGrammar=generateCameraLanguage(factual,"image");
  const grounded=groundedFactSummary(factual);
  const targetWords=field==="midjourney" ? "60-90 words" : "70-100 words";

  return `Generate the ${field.toUpperCase()} still-image prompt only from grounded facts.

STAGE_1_FACTS:
${JSON.stringify(factual)}

GROUNDING PRIORITY:
${JSON.stringify(grounded)}

CAMERA_GRAMMAR:
${JSON.stringify(cameraGrammar)}

STYLE:
${style}

GROUNDING RULES:
- Use ONLY details present in STAGE_1_FACTS or CAMERA_GRAMMAR.
- If a fact is absent, omit it.
- Never invent clothing, colors, fabric, location, lighting source, props, expression, background elements, or object details.
- Preserve exact specific facts from Stage 1.
- Prioritize in this order: clothing, pose, environment, lighting, composition.
- Every prompt must reference at least one grounded clothing fact when visible, one grounded environment fact, and one grounded lighting fact.
- Avoid ethnicity labels and describe only visible grounded features.
- Avoid exact camera or lens guesses. Prefer: moderate depth of field, subject in focus, background softly out of focus, soft frontal lighting, warm hallway illumination.
- Do not use these phrases or close variants: ARRI Alexa, spherical 50mm lens, film-grade color, teal-orange grade, creamy bokeh, ultra-realistic commercial aesthetic, masterpiece, award-winning.
- Still image only: no subject motion, camera motion, environmental motion, scene progression, transitions, dolly, tracking, push-in, orbit, pan, tilt, zoom, or handheld movement.
- Write a complete prompt with terminal punctuation.

PLATFORM DIRECTIONS:
${instructions}

Return ONLY valid JSON:
{
  "${field}": "${targetWords}."
}`;
}

function generateFluxPrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"flux",
    label:"Flux",
    systemPrompt:FLUX_IMAGE_SYSTEM,
    dbg,
    prompt:buildImagePlatformPrompt("flux",factual,stylePreset,`FLUX focus:
- photorealistic image language
- grounded composition and depth of field
- lighting direction and shadow behavior
- skin, fabric, surface, and material texture
- clean realism without cinematic motion language`),
  });
}

function generateMidjourneyPrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"midjourney",
    label:"Midjourney",
    systemPrompt:MIDJOURNEY_IMAGE_SYSTEM,
    dbg,
    prompt:buildImagePlatformPrompt("midjourney",factual,stylePreset,`MIDJOURNEY focus:
- visual richness
- artful still-image composition
- color harmony and image aesthetics
- grounded subject, environment, lighting, and materials

Do not include Midjourney parameters such as --ar, --stylize, --style, or --v.`),
  });
}

function generateNanoBananaPrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"nano_banana",
    label:"Nano Banana",
    systemPrompt:NANO_BANANA_SYSTEM,
    dbg,
    prompt:buildImagePlatformPrompt("nano_banana",factual,stylePreset,`NANO BANANA focus:
- subject fidelity above all else
- facial accuracy and visible identity cues
- exact clothing colors, garment types, accessories, and textures
- lighting realism and true shadow direction
- pose preservation and composition preservation
- realistic skin, hair, fabric, and surface texture

Avoid cinematic buzzwords, blockbuster language, excessive camera jargon, glamour filler, and any detail not present in Stage 1. Prefer literal photorealistic phrasing over style-heavy prose.`),
  });
}

function generateImagenPrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"imagen",
    label:"Imagen",
    systemPrompt:IMAGEN_SYSTEM,
    dbg,
    prompt:buildImagePlatformPrompt("imagen",factual,stylePreset,`IMAGEN focus:
- factual accuracy
- clear natural-language description
- grounded subject, environment, surfaces, lighting, and color palette
- no ornamental phrasing that adds unsupported details`),
  });
}

function generateRecraftPrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"recraft",
    label:"Recraft",
    systemPrompt:RECRAFT_SYSTEM,
    dbg,
    prompt:buildImagePlatformPrompt("recraft",factual,stylePreset,`RECRAFT focus:
- design clarity
- clean still-image composition
- commercial visual quality
- readable shapes, controlled color, and polished presentation
- grounded materials and lighting`),
  });
}

function generateSDXLPrompt(factual,stylePreset,dbg) {
  return generatePlatformField({
    field:"sdxl",
    label:"SDXL",
    systemPrompt:SDXL_SYSTEM,
    dbg,
    prompt:buildImagePlatformPrompt("sdxl",factual,stylePreset,`SDXL focus:
- detailed visual description
- realistic materials and textures
- camera and lighting detail
- natural anatomy and grounded photorealism
- concise negative-prone clarity without unsupported additions`),
  });
}

function buildImagePromptSharedFields(factual,stylePreset) {
  const p=getPreset(stylePreset||"cinematic");
  const cameraGrammar=generateCameraLanguage(factual,"image");
  const lighting=cleanFact(factual?.lighting)||"grounded lighting";
  const lens=groundedCompositionText(factual,cameraGrammar.lensBehavior);
  const environment=cleanFact(factual?.environment)||"visible environment";

  return {
    negative:"Avoid invented clothing, inaccurate colors, distorted anatomy, extra limbs, warped faces, ungrounded props, fake text, watermarks, and generic AI gloss.",
    camera_spec:`${cameraGrammar.framing}, ${lens}, ${cameraGrammar.lensBehavior}`,
    style_tags:[
      p.label,
      "photorealistic",
      lighting,
      environment,
      lens,
    ].map(v=>String(v).trim()).filter(Boolean).slice(0,5),
  };
}

async function generateImagePromptsByPlatform(factual,stylePreset,dbg) {
  const settle=p=>p.then(value=>({ok:true,value})).catch(error=>({ok:false,error}));
  const results=await Promise.all([
    generateFluxPrompt(factual,stylePreset,dbg),
    generateMidjourneyPrompt(factual,stylePreset,dbg),
    generateNanoBananaPrompt(factual,stylePreset,dbg),
    generateImagenPrompt(factual,stylePreset,dbg),
    generateRecraftPrompt(factual,stylePreset,dbg),
    generateSDXLPrompt(factual,stylePreset,dbg),
  ].map(settle));
  const failed=results.find(r=>!r.ok);
  if(failed) throw failed.error;
  const [flux,midjourney,nano_banana,imagen,recraft,sdxl]=results.map(r=>r.value);

  return {
    flux,
    midjourney,
    nano_banana,
    imagen,
    recraft,
    sdxl,
    ...buildImagePromptSharedFields(factual,stylePreset),
  };
}

async function generateImagePromptsWithRetry(factual,stylePreset,mediaType,dbg) {
  let lastErr;
  for(let attempt=1;attempt<=2;attempt++) {
    try {
      const prompts=await generateImagePromptsByPlatform(factual,stylePreset,dbg);
      logStage2Debug(`image platform prompts attempt ${attempt}`,prompts);
      const issues=validatePrompts({factual,prompts},mediaType);
      if(issues.length) {
        logStage2Debug(`image validation errors attempt ${attempt}`,issues);
        throw new Error(`Prompt validation failed: ${issues.join("; ")}`);
      }
      return prompts;
    } catch(e) {
      lastErr=e;
      dbg.err("Stage2",`Attempt ${attempt} rejected`,e);
      if(attempt<2) dbg.log("Stage2","Retrying image platform generation once with same grounded inputs");
    }
  }
  return diagnostic("Prompt generation incomplete",lastErr?.message||"Stage2 failed",dbg,mediaType);
}

// - JSON REPAIR -
function repairJSON(text) {
  let s=text.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
  const start=s.indexOf("{");
  if(start===-1) return null;
  s=s.slice(start);
  try{return JSON.parse(s);}catch{}
  return null;
}
function extractJSON(text,stage) {
  const r=repairJSON(text);
  if(r) return r;
  throw new Error(`${stage} invalid JSON. Preview: ${text.slice(0,300)}`);
}

function extractCompleteJSONObject(text,stage) {
  let s=String(text||"").replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  const start=s.indexOf("{");
  if(start===-1) throw new Error(`${stage} invalid JSON: no object start. Preview: ${s.slice(0,300)}`);

  let depth=0,inString=false,escape=false,end=-1;
  for(let i=start;i<s.length;i++) {
    const ch=s[i];
    if(escape){escape=false;continue;}
    if(ch==="\\"){escape=true;continue;}
    if(ch==='"'){inString=!inString;continue;}
    if(inString) continue;
    if(ch==="{") depth++;
    if(ch==="}") {
      depth--;
      if(depth===0){end=i+1;break;}
    }
  }
  if(end===-1) throw new Error(`${stage} invalid JSON: incomplete object. Preview: ${s.slice(start,start+300)}`);

  const jsonText=s.slice(start,end);
  try{return JSON.parse(jsonText);}
  catch(e){throw new Error(`${stage} invalid JSON: ${e.message}. Preview: ${jsonText.slice(0,300)}`);}
}

function logStage1Debug(label,value) {
  console.log(`\n[Stage1 ${label}]`);
  if(typeof value==="string") console.log(value);
  else console.log(JSON.stringify(value,null,2));
}

function logStage2Debug(label,value) {
  console.log(`\n[Stage2 ${label}]`);
  if(typeof value==="string") console.log(value);
  else console.log(JSON.stringify(value,null,2));
}

function diagnostic(error, reason, dbg, mediaType) {
  return {
    error,
    reason,
    debug: dbg.summary(),
    analysisMode: "two-stage-grounded-v1",
    mediaType,
    generatedAt: new Date().toISOString(),
  };
}

function hasUsableFact(v) {
  if(Array.isArray(v)) return v.length > 0;
  if(typeof v !== "string") return Boolean(v);
  const s = v.trim().toLowerCase();
  return s.length >= 3 && s !== "not visible" && s !== "unknown" && s !== "n/a";
}

function validateFactualAnalysis(factual) {
  const issues = [];
  const contentType=String(factual?.content_type||"").trim().toLowerCase();
  const textHeavyContent=["ui_screenshot","document","screen_recording"].includes(contentType);
  const sceneContent=["interior_design","architecture","environment_scene"].includes(contentType);
  const objectContent=["product","food"].includes(contentType);
  const validationMode=textHeavyContent ? "text" : sceneContent ? "scene" : objectContent ? "object" : "human";
  console.log("[content validation path]");
  console.log(JSON.stringify({content_type:contentType||"other",validation_mode:validationMode},null,2));
  const required = objectContent
    ? ["environment","surfaces","lighting","mood_atmosphere"]
    : ["environment","lighting","color_palette","lens_feel"];
  for(const field of required) {
    if(!hasUsableFact(factual?.[field])) issues.push(`${field}: missing or unusable`);
  }
  if(textHeavyContent) {
    if(!hasUsableFact(factual?.overlay_text)) {
      issues.push("visible textual content: missing readable overlay_text");
    }
  } else if(sceneContent) {
    for(const field of ["surfaces","mood_atmosphere"]) {
      if(!hasUsableFact(factual?.[field])) issues.push(`${field}: missing or unusable`);
    }
  } else if(objectContent) {
    if(!hasUsableFact(factual?.overlay_topic)&&
       !hasUsableFact(factual?.overlay_text)&&
       !hasUsableFact(factual?.scene_purpose)&&
       !hasUsableFact(factual?.activity_context)&&
       !hasUsableFact(factual?.pose_action)) {
      issues.push("object detail: missing usable overlay, semantic, or placement facts");
    }
  } else if(!hasUsableFact(factual?.pose_action) && !hasUsableFact(factual?.face) && !hasUsableFact(factual?.accessories)) {
    issues.push("visual detail: missing usable pose, face, or object/accessory facts");
  }
  return issues;
}

function flattenFactValue(value) {
  if(value==null) return "";
  if(typeof value==="string") return value.trim();
  if(typeof value==="number"||typeof value==="boolean") return String(value);
  if(Array.isArray(value)) {
    return value.map(flattenFactValue).filter(Boolean).join(", ");
  }
  if(typeof value==="object") {
    return Object.values(value).map(flattenFactValue).filter(Boolean).join(" ");
  }
  return String(value).trim();
}

function removeRedundantUnknowns(text) {
  const parts=String(text||"")
    .split(/\s*,\s*/)
    .map(s=>s.trim())
    .filter(Boolean);
  const unknown=/^(not visible|cannot determine|unknown|n\/a|not applicable)$/i;
  const hasKnown=parts.some(p=>!unknown.test(p));
  if(!hasKnown) return parts[0]||"";
  return parts.filter(p=>!unknown.test(p)).join(", ");
}

function normalizeStage1Facts(factual) {
  const normalized={...factual};
  for(const [key,value] of Object.entries(normalized)) {
    if(key==="uncertain_details") {
      normalized[key]=Array.isArray(value)
        ? value.map(flattenFactValue).filter(Boolean)
        : flattenFactValue(value).split(/[,;]\s*/).filter(Boolean);
    } else if(key==="text_present") {
      normalized[key]=value===true || String(value).trim().toLowerCase()==="true";
    } else {
      normalized[key]=removeRedundantUnknowns(flattenFactValue(value));
    }
  }
  normalized.overlay_text=typeof normalized.overlay_text==="string" ? normalized.overlay_text : "";
  normalized.overlay_topic=typeof normalized.overlay_topic==="string" ? normalized.overlay_topic : "";
  normalized.text_present=normalized.text_present===true;
  normalized.transcript=typeof normalized.transcript==="string" ? normalized.transcript : "";
  normalized.speech_present=normalized.speech_present===true;
  normalized.confidence_speech=Number(normalized.confidence_speech)||0;
  normalized.speech_language=typeof normalized.speech_language==="string" ? normalized.speech_language : "";
  normalized.speech_language_confidence=Number(normalized.speech_language_confidence)||0;
  normalized.spoken_topic=typeof normalized.spoken_topic==="string" ? normalized.spoken_topic : "";
  normalized.speaker_intent=typeof normalized.speaker_intent==="string" ? normalized.speaker_intent : "";
  normalized.audio_type=typeof normalized.audio_type==="string" && normalized.audio_type.trim() ? normalized.audio_type : "none";
  if(!["speech","music","speech_and_music","ambient_audio","none"].includes(normalized.audio_type)) normalized.audio_type="none";
  normalized.audio_role=typeof normalized.audio_role==="string" ? normalized.audio_role : "";
  normalized.dialogue_summary=typeof normalized.dialogue_summary==="string" ? normalized.dialogue_summary : "";
  normalized.music_mood=typeof normalized.music_mood==="string" ? normalized.music_mood : "";
  normalized.ambient_audio=typeof normalized.ambient_audio==="string" ? normalized.ambient_audio : "";
  normalized.reel_energy=typeof normalized.reel_energy==="string" ? normalized.reel_energy : "";
  normalized.performance_style=typeof normalized.performance_style==="string" ? normalized.performance_style : "";
  normalized.social_aesthetic=typeof normalized.social_aesthetic==="string" ? normalized.social_aesthetic : "";
  normalized.motion_style=typeof normalized.motion_style==="string" ? normalized.motion_style : "";
  normalized.viewer_feeling=typeof normalized.viewer_feeling==="string" ? normalized.viewer_feeling : "";
  normalized.camera_presence=typeof normalized.camera_presence==="string" ? normalized.camera_presence : "";
  normalized.music_sync_energy=typeof normalized.music_sync_energy==="string" ? normalized.music_sync_energy : "";
  normalized.dance_energy=typeof normalized.dance_energy==="string" ? normalized.dance_energy : "";
  normalized.movement_density=typeof normalized.movement_density==="string" ? normalized.movement_density : "";
  normalized.motion_rhythm=typeof normalized.motion_rhythm==="string" ? normalized.motion_rhythm : "";
  normalized.body_motion_style=typeof normalized.body_motion_style==="string" ? normalized.body_motion_style : "";
  normalized.beat_sync_strength=typeof normalized.beat_sync_strength==="string" ? normalized.beat_sync_strength : "";
  normalized.performance_intensity=typeof normalized.performance_intensity==="string" ? normalized.performance_intensity : "";
  normalized.camera_engagement=typeof normalized.camera_engagement==="string" ? normalized.camera_engagement : "";
  normalized.movement_continuity=typeof normalized.movement_continuity==="string" ? normalized.movement_continuity : "";
  normalized.motion_focus=typeof normalized.motion_focus==="string" ? normalized.motion_focus : "";
  normalized.creator_archetype=typeof normalized.creator_archetype==="string" ? normalized.creator_archetype : "";
  normalized.creator_presence=typeof normalized.creator_presence==="string" ? normalized.creator_presence : "";
  normalized.content_personality=typeof normalized.content_personality==="string" ? normalized.content_personality : "";
  normalized.social_platform_style=typeof normalized.social_platform_style==="string" ? normalized.social_platform_style : "";
  normalized.presentation_style=typeof normalized.presentation_style==="string" ? normalized.presentation_style : "";
  normalized.viewer_relationship=typeof normalized.viewer_relationship==="string" ? normalized.viewer_relationship : "";
  normalized.temporal_opening=typeof normalized.temporal_opening==="string" ? normalized.temporal_opening : "";
  normalized.temporal_progression=typeof normalized.temporal_progression==="string" ? normalized.temporal_progression : "";
  normalized.temporal_continuity=typeof normalized.temporal_continuity==="string" ? normalized.temporal_continuity : "";
  normalized.moment_flow=typeof normalized.moment_flow==="string" ? normalized.moment_flow : "";
  normalized.scene_evolution=typeof normalized.scene_evolution==="string" ? normalized.scene_evolution : "";
  normalized.performance_progression=typeof normalized.performance_progression==="string" ? normalized.performance_progression : "";
  normalized.primary_visual_focus=typeof normalized.primary_visual_focus==="string" ? normalized.primary_visual_focus : "";
  normalized.secondary_visual_focus=typeof normalized.secondary_visual_focus==="string" ? normalized.secondary_visual_focus : "";
  normalized.attention_progression=typeof normalized.attention_progression==="string" ? normalized.attention_progression : "";
  normalized.focus_transition=typeof normalized.focus_transition==="string" ? normalized.focus_transition : "";
  normalized.camera_intention=typeof normalized.camera_intention==="string" ? normalized.camera_intention : "";
  normalized.visual_priority_flow=typeof normalized.visual_priority_flow==="string" ? normalized.visual_priority_flow : "";
  normalized.scene_purpose=typeof normalized.scene_purpose==="string" ? normalized.scene_purpose : "";
  normalized.activity_context=typeof normalized.activity_context==="string" ? normalized.activity_context : "";
  normalized.content_theme=typeof normalized.content_theme==="string" ? normalized.content_theme : "";
  normalized.audience_intent=typeof normalized.audience_intent==="string" ? normalized.audience_intent : "";
  normalized.reel_type=typeof normalized.reel_type==="string" && normalized.reel_type.trim() ? normalized.reel_type : "other";
  normalized.primary_object=typeof normalized.primary_object==="string" ? normalized.primary_object : "";
  normalized.secondary_objects=Array.isArray(normalized.secondary_objects)
    ? normalized.secondary_objects.map(flattenFactValue).filter(Boolean)
    : flattenFactValue(normalized.secondary_objects).split(/[,;]\s*/).filter(Boolean);
  normalized.hero_element=typeof normalized.hero_element==="string" ? normalized.hero_element : "";
  normalized.product_identity=typeof normalized.product_identity==="string" ? normalized.product_identity : "";
  normalized.food_focus=typeof normalized.food_focus==="string" ? normalized.food_focus : "";
  normalized.confidence_product_identity=Number(normalized.confidence_product_identity)||0;
  normalized.confidence_reel_type=Number(normalized.confidence_reel_type)||0;
  normalized.confidence_semantic_scene=Number(normalized.confidence_semantic_scene)||0;
  normalized.screen_context=typeof normalized.screen_context==="string" ? normalized.screen_context : "";
  normalized.interaction_type=typeof normalized.interaction_type==="string" ? normalized.interaction_type : "";
  normalized.workflow_stage=typeof normalized.workflow_stage==="string" ? normalized.workflow_stage : "";
  normalized.workflow_domain=typeof normalized.workflow_domain==="string" ? normalized.workflow_domain : "";
  normalized.confidence_workflow_domain=Number(normalized.confidence_workflow_domain)||0;
  return normalized;
}

function execFileAsync(cmd,args,options={}) {
  return new Promise((resolve,reject)=>{
    execFile(cmd,args,options,(error,stdout,stderr)=>{
      if(error) {
        error.stdout=stdout;
        error.stderr=stderr;
        reject(error);
      } else {
        resolve({stdout,stderr});
      }
    });
  });
}

function whisperModelConfig() {
  const configuredPath=process.env.WHISPER_MODEL_PATH;
  const configuredModel=process.env.WHISPER_MODEL;
  if(configuredPath&&/\.bin$/i.test(configuredPath)) {
    const baseName=path.basename(configuredPath).replace(/^ggml-/i,"").replace(/\.bin$/i,"");
    return {
      modelName:configuredModel||baseName||"base",
      modelRootPath:path.dirname(configuredPath),
      configuredPath,
    };
  }
  return {
    modelName:configuredModel||"base",
    modelRootPath:configuredPath,
    configuredPath:configuredPath||"",
  };
}

function detectSpeechLanguage(transcript, detectedLanguage="", detectedConfidence=0) {
  const raw=String(detectedLanguage||"").trim().toLowerCase();
  const text=String(transcript||"");
  if(raw) {
    return normalizeWhisperLanguage(raw,detectedConfidence);
  }
  const hasDevanagari=/[\u0900-\u097F]/.test(text);
  const hasArabicUrdu=/[\u0600-\u06FF]/.test(text);
  const hasLatin=/[a-z]/i.test(text);
  const hindiRoman=/\b(hai|hain|nahi|nahin|kya|kaise|kaisa|kyun|mein|mai|mera|meri|aap|apna|karna|karo|dekho|yeh|woh|aur|hum|tum|bahut|thoda|wala|wali)\b/i.test(text);
  const englishWords=(text.match(/\b(the|and|you|this|that|today|show|make|how|video|will|can|with|for|to|in|is|are)\b/gi)||[]).length;
  let normalized="";
  let confidence=Number(detectedConfidence)||0;
  if(hasDevanagari&&hasLatin&&englishWords>0) {
    normalized="Hindi-English";
    confidence=0.75;
  } else if(hasDevanagari) {
    normalized="Hindi";
    confidence=0.8;
  } else if(hasArabicUrdu) {
    normalized="Urdu";
    confidence=0.8;
  } else if(hindiRoman&&englishWords>1) {
    normalized="Hindi-English";
    confidence=0.65;
  } else if(hindiRoman) {
    normalized="Hindi";
    confidence=0.55;
  } else if(hasLatin&&text.trim()) {
    normalized="English";
    confidence=0.6;
  }
  return {
    detectedLanguage:raw||"",
    normalizedLanguage:normalized,
    confidence:Math.max(0,Math.min(1,confidence)),
  };
}

function normalizeWhisperLanguage(language, probability=0) {
  const code=String(language||"").trim().toLowerCase();
  const map={
    hi:"Hindi",
    hindi:"Hindi",
    ur:"Urdu",
    urdu:"Urdu",
    en:"English",
    eng:"English",
    english:"English",
    bn:"Bengali",
    bengali:"Bengali",
    ta:"Tamil",
    tamil:"Tamil",
    te:"Telugu",
    telugu:"Telugu",
    mr:"Marathi",
    marathi:"Marathi",
    gu:"Gujarati",
    gujarati:"Gujarati",
    pa:"Punjabi",
    punjabi:"Punjabi",
  };
  const mixed=/mixed|hinglish|hi-en|en-hi/.test(code);
  return {
    detectedLanguage:code,
    normalizedLanguage:mixed ? "Hindi-English" : (map[code]||""),
    confidence:Math.max(0,Math.min(1,Number(probability)||0.8)),
  };
}

function parseWhisperLanguageFromLogs(logText) {
  const text=String(logText||"");
  const match=text.match(/auto-detected language:\s*([a-z-]+)\s*\(p\s*=\s*([0-9.]+)\)/i);
  if(!match) return {language:"",confidence:0};
  return {language:match[1].toLowerCase(),confidence:Number(match[2])||0};
}

async function transcribeAudio({audioBase64,audioMimeType,dbg}) {
  console.log("[transcribeAudio entered]");
  console.log("[analyzer audio check]",{
    hasAudioBase64:!!audioBase64,
    mimeType:audioMimeType,
  });
  if(!audioBase64) return {speech_present:false,transcript:"",speech_language:"",speech_language_confidence:0};

  console.log("[audio received]");
  console.log(JSON.stringify({
    mimeType:audioMimeType||"audio/webm",
    sizeKB:Math.round(audioBase64.length*0.75/1024),
  },null,2));

  const tempDir=path.join(__dirname,"temp","audio");
  fs.mkdirSync(tempDir,{recursive:true});
  const id=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const webmPath=path.join(tempDir,`${id}.webm`);
  const wavPath=path.join(tempDir,`${id}.wav`);

  try{
    fs.writeFileSync(webmPath,Buffer.from(audioBase64,"base64"));
    console.log("[audio file written]",{
      input:path.basename(webmPath),
      bytes:fs.statSync(webmPath).size,
    });
    let ffmpegPath;
    try{ffmpegPath=require("ffmpeg-static");}
    catch(e){throw new Error("ffmpeg-static unavailable: "+e.message);}
    await execFileAsync(ffmpegPath,["-y","-i",webmPath,"-ac","1","-ar","16000",wavPath],{timeout:60000});
    const wavKB=fs.existsSync(wavPath)?Math.round(fs.statSync(wavPath).size/1024):0;
    console.log("[audio converted]");
    console.log(JSON.stringify({input:path.basename(webmPath),output:path.basename(wavPath),wavKB},null,2));
  }catch(e){
    console.log("[audio conversion failed]");
    console.log(JSON.stringify({error:e.message},null,2));
    console.error(e?.stack||e);
    dbg?.err?.("speech analysis","audio conversion failed",e);
    try{if(fs.existsSync(webmPath)) fs.unlinkSync(webmPath);}catch{}
    try{if(fs.existsSync(wavPath)) fs.unlinkSync(wavPath);}catch{}
    return {speech_present:false,transcript:"",speech_language:"",speech_language_confidence:0};
  }

  try{
    const { nodewhisper } = require("nodejs-whisper");
    const whisperConfig=whisperModelConfig();
    const modelName=whisperConfig.modelName;
    const whisperLogs=[];
    const captureWhisperLog=(...args)=>{
      const line=args.map(arg=>typeof arg==="string" ? arg : JSON.stringify(arg)).join(" ");
      whisperLogs.push(line);
    };
    console.log("[whisper start]");
    const whisperOutput=await nodewhisper(wavPath,{
      modelName,
      modelRootPath:whisperConfig.modelRootPath,
      removeWavFileAfterTranscription:false,
      withCuda:process.env.WHISPER_CUDA==="1",
      logger:{debug:captureWhisperLog,log:captureWhisperLog,warn:captureWhisperLog,error:captureWhisperLog},
      whisperOptions:{
        outputInText:false,
        outputInSrt:false,
        outputInVtt:false,
        outputInJson:false,
        outputInJsonFull:false,
        outputInCsv:false,
        translateToEnglish:false,
        wordTimestamps:false,
      },
    });
    const transcript=String(typeof whisperOutput==="string" ? whisperOutput : (whisperOutput?.transcript||whisperOutput?.text||"")).trim();
    const whisperLanguage=parseWhisperLanguageFromLogs(whisperLogs.join("\n"));
    const language=detectSpeechLanguage(
      transcript,
      whisperOutput?.language||whisperOutput?.detectedLanguage||whisperLanguage.language,
      whisperOutput?.languageProbability||whisperOutput?.confidence||whisperLanguage.confidence
    );
    console.log("[speech language source]");
    console.log(JSON.stringify({
      source:whisperLanguage.language||whisperOutput?.language||whisperOutput?.detectedLanguage ? "whisper" : "transcript",
      language:whisperOutput?.language||whisperOutput?.detectedLanguage||whisperLanguage.language||language.normalizedLanguage,
      confidence:whisperOutput?.languageProbability||whisperOutput?.confidence||whisperLanguage.confidence||language.confidence,
    },null,2));
    console.log("[speech language]");
    console.log(JSON.stringify({
      detectedLanguage:language.detectedLanguage,
      normalizedLanguage:language.normalizedLanguage,
      confidence:language.confidence,
    },null,2));
    console.log("[whisper result]",{
      chars:transcript.length,
      preview:transcript.slice(0,120),
    });
    const result={
      speech_present:Boolean(transcript),
      transcript,
      speech_language:language.normalizedLanguage,
      speech_language_confidence:language.confidence,
    };
    console.log("[whisper transcription]");
    console.log(JSON.stringify({
      speech_present:result.speech_present,
      transcript_preview:transcript.slice(0,120),
    },null,2));
    return result;
  }catch(e){
    console.log("[whisper failed]");
    console.log(JSON.stringify({error:e.message},null,2));
    console.error(e?.stack||e);
    dbg?.err?.("speech analysis","whisper failed",e);
    return {speech_present:false,transcript:"",speech_language:"",speech_language_confidence:0};
  }finally{
    try{if(fs.existsSync(webmPath)) fs.unlinkSync(webmPath);}catch{}
    try{if(fs.existsSync(wavPath)) fs.unlinkSync(wavPath);}catch{}
  }
}

async function analyzeSpeech(images,mediaType,dbg,audioPayload={}) {
  if(mediaType!=="video") return {speech_present:false,transcript:"",speech_language:"",speech_language_confidence:0};
  const whisperResult=await transcribeAudio({
    audioBase64:audioPayload.audioBase64,
    audioMimeType:audioPayload.audioMimeType,
    dbg,
  });
  if(whisperResult.speech_present||whisperResult.transcript) return whisperResult;
  const transcript=images
    .map(img=>typeof img?.transcript==="string" ? img.transcript.trim() : "")
    .filter(Boolean)
    .join(" ")
    .trim();
  const language=detectSpeechLanguage(transcript);
  if(transcript) {
    console.log("[speech language source]");
    console.log(JSON.stringify({
      source:"transcript",
      language:language.normalizedLanguage,
      confidence:language.confidence,
    },null,2));
    console.log("[speech language]");
    console.log(JSON.stringify({
      detectedLanguage:language.detectedLanguage,
      normalizedLanguage:language.normalizedLanguage,
      confidence:language.confidence,
    },null,2));
  }
  const result={
    speech_present:Boolean(transcript),
    transcript,
    speech_language:language.normalizedLanguage,
    speech_language_confidence:language.confidence,
  };
  dbg.log("speech analysis","Transcript extraction",{
    speech_present:result.speech_present,
    transcript_preview:transcript.slice(0,120),
  });
  return result;
}

async function summarizeSpeechTopic(transcript,dbg) {
  const text=String(transcript||"").trim();
  if(!text) return {spoken_topic:"",speaker_intent:""};
  const sysPrompt="You summarize speech transcripts into short factual context for video prompt generation. Return only valid JSON.";
  const prompt=`Summarize this transcript without quoting it.

Rules:
- Return only valid JSON.
- Use 3 to 12 words maximum per field.
- Be factual only.
- No marketing language.
- No interpretation beyond transcript content.
- No invented information.
- Do not quote transcript text.

Transcript:
${text}

Return:
{
  "spoken_topic": "",
  "speaker_intent": ""
}`;
  try{
    const raw=await callAI(prompt,sysPrompt,[],dbg);
    const parsed=extractJSON(raw,"SpeechTopic");
    return {
      spoken_topic:cleanFact(parsed?.spoken_topic),
      speaker_intent:cleanFact(parsed?.speaker_intent),
    };
  }catch(e){
    dbg?.err?.("speech grounding","speech topic summarization failed",e);
    return {spoken_topic:"",speaker_intent:""};
  }
}

function estimateTranscriptQuality(transcript, whisperLanguageConfidence=0) {
  const text=String(transcript||"").trim();
  const words=(text.match(/[A-Za-z']+|[\u0900-\u097F]+|[\u0600-\u06FF]+/g)||[]).map(w=>w.toLowerCase().replace(/^'+|'+$/g,"")).filter(Boolean);
  const devanagariChars=(text.match(/[\u0900-\u097F]/g)||[]).length;
  const scriptChars=(text.match(/[\u0900-\u097F\u0600-\u06FF]/g)||[]).length;
  const letterChars=(text.match(/[A-Za-z\u0900-\u097F\u0600-\u06FF]/g)||[]).length;
  const devanagariRatio=letterChars ? devanagariChars/letterChars : 0;
  const scriptRatio=letterChars ? scriptChars/letterChars : 0;
  const common=new Set(("a an and are as at be but by can do for from get go had has have he her here him his how i if in into is it its just know like me my no not of on or our out she so that the their them there they this to today up us video was we what when where who why will with you your " +
    "show make create generate explain teach review compare demonstrate guide build cook prepare use try need want learn help turn open select write edit enjoy enjoyed watch watching subscribe follow share " +
    "medical healthcare health professional doctor nurse clinician clinic hospital patient treatment care symptom symptoms medicine therapy diagnosis explaining speaking presenting gesture gesturing point pointing information " +
    "hai hain nahi nahin kya kaise kaisa kyun mein mai mera meri aap apna karna karo dekho yeh woh aur hum tum bahut thoda wala wali").split(/\s+/));
  const recognized=words.filter(w=>/[\u0900-\u097F\u0600-\u06FF]/.test(w)||common.has(w)||/^(speak|explain|present|teach|review|demonstrat|generat|prepar|creat|show|edit|typ|walk|talk)(ing|ed|s)?$/.test(w));
  const totalWords=words.length;
  const ratio=totalWords ? recognized.length/totalWords : 0;
  const repeated=totalWords>2&&new Set(words).size<=Math.ceil(totalWords*0.45);
  const gibberish=words.filter(w=>w.length>5&&!/[\u0900-\u097F\u0600-\u06FF]/.test(w)&&!common.has(w)&&!/[aeiou]/.test(w.replace(/y/g,""))).length;
  let quality=0;
  if(!totalWords) quality=0;
  else if(scriptRatio>=0.45&&totalWords>=2) quality=0.8;
  else if(ratio>=0.8&&totalWords>=4) quality=1.0;
  else if(ratio>=0.65) quality=0.7;
  else if(ratio>=0.4) quality=0.5;
  else if(ratio>=0.2) quality=0.3;
  else quality=0.1;
  if(repeated) quality=Math.min(quality,0.2);
  if(totalWords<=3&&ratio<0.5&&scriptRatio<0.45) quality=Math.min(quality,0.2);
  if(gibberish>=2) quality=Math.min(quality,0.2);
  const qualityFloorApplied=Number(whisperLanguageConfidence)>=0.8&&devanagariRatio>0.25&&totalWords>=5;
  if(qualityFloorApplied) quality=Math.max(quality,0.8);
  console.log("[quality floor]");
  console.log(JSON.stringify({
    applied:qualityFloorApplied,
    reason:qualityFloorApplied ? "high-confidence Hindi transcript" : "",
  },null,2));
  return {
    quality:Math.round(quality*100)/100,
    recognizedWords:recognized.length,
    totalWords,
    ratio:Math.round(ratio*100)/100,
  };
}

function estimateSpeechConfidence(transcript, speechPresent, speechLanguageConfidence=0) {
  const text=String(transcript||"").trim();
  if(!speechPresent||!text) return 0;
  const transcriptQuality=estimateTranscriptQuality(text,speechLanguageConfidence);
  console.log("[transcript quality]");
  console.log(JSON.stringify({
    quality:transcriptQuality.quality,
    recognizedWords:transcriptQuality.recognizedWords,
    ratio:transcriptQuality.ratio,
  },null,2));
  const words=text.match(/[a-z0-9']+/gi)||[];
  const uniqueWords=new Set(words.map(w=>w.toLowerCase()));
  const hasSentencePunctuation=/[.!?]/.test(text);
  const hasActionVerb=/\b(show|make|create|generate|explain|teach|review|compare|demonstrate|walk|guide|build|cook|prepare|use|try|need|want|learn|help|turn|open|select|write|edit)\b/i.test(text);
  const unusual=/\b(number\s+1\s+in\s+a\s+cup|not sure if i can get it|i can get it|let'?s go|yeah|uh|um|hmm)\b/i.test(text);
  const lyricDetected=isLyricTranscript(text);
  let confidence=0.2;
  if(words.length===0) confidence=0;
  else if(unusual||uniqueWords.size<Math.max(2,Math.ceil(words.length*0.5))) confidence=0.2;
  else if(words.length>=7&&uniqueWords.size>=5&&(hasSentencePunctuation||hasActionVerb)) confidence=1.0;
  else if(words.length>=3&&(hasActionVerb||uniqueWords.size>=3)) confidence=0.7;
  else if(words.length>=2) confidence=0.4;
  if(lyricDetected) confidence=Math.min(confidence,0.2);
  if(transcriptQuality.quality>=0.8) confidence=confidence;
  else if(transcriptQuality.quality>=0.5) confidence=Math.min(confidence,0.6);
  else if(transcriptQuality.quality>=0.3) confidence=Math.min(confidence,0.3);
  else confidence=0.1;
  const hasValidLanguageScript=/[\u0900-\u097F\u0600-\u06FF]/.test(text);
  if(Number(speechLanguageConfidence)>=0.8&&hasValidLanguageScript&&transcriptQuality.quality>=0.7) {
    confidence=Math.max(confidence,0.85);
  }
  console.log("[lyric detection]");
  console.log(JSON.stringify({
    detected:lyricDetected,
    confidenceAdjusted:lyricDetected,
  },null,2));
  return confidence;
}

async function deriveSemanticSceneUnderstanding(factual,dbg) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  const productFood=["product","food"].includes(contentType);
  const sceneOnly=["interior_design","architecture","environment_scene"].includes(contentType);
  const confidenceSpeech=Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0));
  const baseSpeechWeight=productFood||sceneOnly ? 1 : 3;
  let speechWeight=baseSpeechWeight;
  if(confidenceSpeech>=0.8) speechWeight=baseSpeechWeight;
  else if(confidenceSpeech>=0.5) speechWeight=Math.min(baseSpeechWeight,2);
  else if(confidenceSpeech>=0.3) speechWeight=1;
  else speechWeight=0;
  const weights=productFood
    ? {content_type:contentType||"other",visualWeight:5,ocrWeight:4,speechWeight}
    : sceneOnly
      ? {content_type:contentType||"other",visualWeight:5,ocrWeight:3,speechWeight}
      : {content_type:contentType||"other",visualWeight:3,ocrWeight:3,speechWeight};
  console.log("[semantic weighting]");
  console.log(JSON.stringify(weights,null,2));
  dbg?.log?.("semantic weighting","Evidence weights",weights);
  const safeFacts={
    content_type:cleanFact(factual?.content_type),
    subjects:cleanFact(factual?.subjects),
    face:cleanFact(factual?.face),
    hair:cleanFact(factual?.hair),
    clothing_top:cleanFact(factual?.clothing_top),
    clothing_bottom:cleanFact(factual?.clothing_bottom),
    footwear:cleanFact(factual?.footwear),
    accessories:cleanFact(factual?.accessories),
    pose_action:cleanFact(factual?.pose_action),
    environment:cleanFact(factual?.environment),
    surfaces:cleanFact(factual?.surfaces),
    lighting:cleanFact(factual?.lighting),
    color_palette:cleanFact(factual?.color_palette),
    mood_atmosphere:cleanFact(factual?.mood_atmosphere),
    overlay_topic:cleanFact(factual?.overlay_topic),
    spoken_topic:confidenceSpeech>=0.5 ? cleanFact(factual?.spoken_topic) : "",
    speaker_intent:confidenceSpeech>=0.5 ? cleanFact(factual?.speaker_intent) : "",
    confidence_speech:confidenceSpeech,
  };
  const hasContext=Object.values(safeFacts).some(Boolean);
  if(!hasContext) return {scene_purpose:"",activity_context:"",content_theme:"",audience_intent:""};
  const sysPrompt="You derive concise factual semantic scene context from visual, OCR-topic, and speech-topic facts. Return only valid JSON.";
  const prompt=`Create semantic scene understanding from these facts only.

Rules:
- Return only valid JSON.
- Each field must be 2 to 8 words maximum.
- Prefer concise labels, not full sentences.
- Factual and concise only.
- No marketing language.
- No speculation.
- No invented information.
- Do not quote overlay text or transcript text.
- Use content_type, visual facts, OCR topic, spoken_topic, and speaker_intent when present.
- Evidence weighting: visual facts weight ${weights.visualWeight}, OCR topic weight ${weights.ocrWeight}, speech facts weight ${weights.speechWeight}.
- Speech confidence is ${confidenceSpeech}. If below 0.5, speech may only support visual/OCR evidence and must not drive scene_purpose, content_theme, or audience_intent.
- For product and food content, prioritize visual facts first, OCR topic second, spoken_topic third, speaker_intent last.
- For interior design, architecture, and environment scenes, prioritize visual facts first, OCR topic second, spoken_topic third.
- For human_scene, tutorial, and talking-head content, use balanced weighting.
- Do not allow spoken_topic or speaker_intent to become the primary theme when it does not directly reference visible content.
- Downweight generic uncertainty, motivational, acquisition, or hype statements unless visuals clearly support them.
- Examples to downweight: "I don't know if I can get it", "I can do this", "Believe in yourself", "Let's go".
- If OCR topic identifies a product name, food item, software workflow, or screen context, prefer OCR topic over vague speech topic.

Facts:
${JSON.stringify(safeFacts)}

Return:
{
  "scene_purpose": "",
  "activity_context": "",
  "content_theme": "",
  "audience_intent": ""
}`;
  try{
    const raw=await callAI(prompt,sysPrompt,[],dbg);
    const parsed=extractJSON(raw,"SemanticScene");
    return {
      scene_purpose:cleanFact(parsed?.scene_purpose),
      activity_context:cleanFact(parsed?.activity_context),
      content_theme:cleanFact(parsed?.content_theme),
      audience_intent:cleanFact(parsed?.audience_intent),
    };
  }catch(e){
    dbg?.err?.("semantic scene understanding","semantic derivation failed",e);
    return {scene_purpose:"",activity_context:"",content_theme:"",audience_intent:""};
  }
}

async function deriveReelType(factual,dbg) {
  const allowed=[
    "fashion_portrait",
    "beauty_portrait",
    "lifestyle_portrait",
    "fitness_creator",
    "motivational_talking_head",
    "educational_talking_head",
    "product_showcase",
    "product_review",
    "software_demo",
    "ai_tool_demo",
    "tutorial",
    "food_content",
    "food_preparation",
    "food_product_showcase",
    "travel_content",
    "interior_design",
    "architecture",
    "nature_scene",
    "animal_content",
    "dance_performance",
    "music_performance",
    "cinematic_broll",
    "other",
  ];
  const confidenceSpeech=Math.max(0,Math.min(1,Number(factual?.confidence_speech)||0));
  const safeFacts={
    content_type:cleanFact(factual?.content_type),
    scene_purpose:cleanFact(factual?.scene_purpose),
    activity_context:cleanFact(factual?.activity_context),
    content_theme:cleanFact(factual?.content_theme),
    spoken_topic:confidenceSpeech>=0.5 ? cleanFact(factual?.spoken_topic) : "",
    speaker_intent:confidenceSpeech>=0.5 ? cleanFact(factual?.speaker_intent) : "",
    confidence_speech:confidenceSpeech,
    overlay_topic:cleanFact(factual?.overlay_topic),
    subjects:cleanFact(factual?.subjects),
    clothing_top:cleanFact(factual?.clothing_top),
    clothing_bottom:cleanFact(factual?.clothing_bottom),
    pose_action:cleanFact(factual?.pose_action),
    environment:cleanFact(factual?.environment),
    accessories:cleanFact(factual?.accessories),
    visible_motion_cues:cleanFact(factual?.visible_motion_cues),
    subject_motion:cleanFact(factual?.subject_motion),
    inferred_motion:cleanFact(factual?.inferred_motion),
    primary_object:cleanFact(factual?.primary_object),
    hero_element:cleanFact(factual?.hero_element),
    product_identity:cleanFact(factual?.product_identity),
    food_focus:cleanFact(factual?.food_focus),
  };
  const sysPrompt="You classify Instagram reels into one factual category using only supplied evidence. Return only valid JSON.";
  const prompt=`Choose exactly one reel_type from this allowed list:
${allowed.join(", ")}

Rules:
- Return only valid JSON.
- Use only supplied evidence.
- Keep classification factual.
- Do not infer creator intent beyond available evidence.
- Use "other" when confidence is low.
- If confidence_speech is below 0.5, do not classify motivational_talking_head or educational_talking_head from speech alone. Require visual or OCR support.

Evidence:
${JSON.stringify(safeFacts)}

Return:
{
  "reel_type": "other"
}`;
  try{
    const raw=await callAI(prompt,sysPrompt,[],dbg);
    const parsed=extractJSON(raw,"ReelType");
    const reelType=cleanFact(parsed?.reel_type);
    const visualOrOcrSupport=[
      safeFacts.overlay_topic,
      safeFacts.scene_purpose,
      safeFacts.activity_context,
      safeFacts.content_theme,
      safeFacts.subjects,
      safeFacts.pose_action,
      safeFacts.environment,
    ].some(hasUsableFact);
    if(confidenceSpeech<0.5&&["motivational_talking_head","educational_talking_head"].includes(reelType)&&!visualOrOcrSupport) {
      return "other";
    }
    const previousType=allowed.includes(reelType) ? reelType : "other";
    const healthcareEvidence=/\b(medical|healthcare|health professional|doctor|nurse|clinician)\b/i.test([
      safeFacts.scene_purpose,
      safeFacts.activity_context,
      safeFacts.content_theme,
      safeFacts.subjects,
      safeFacts.environment,
      safeFacts.overlay_topic,
    ].join(" "));
    const talkingEvidence=/\b(speaking|explaining|presenting|gesturing)\b/i.test(safeFacts.activity_context);
    const strongerTypes=new Set([
      "fashion_portrait","beauty_portrait","fitness_creator","product_showcase","product_review",
      "software_demo","ai_tool_demo","tutorial","food_content","travel_content","interior_design",
      "architecture","nature_scene","animal_content","dance_performance","music_performance","cinematic_broll",
    ]);
    if(safeFacts.content_type==="human_scene"&&(healthcareEvidence||talkingEvidence)&&!strongerTypes.has(previousType)) {
      if(previousType!=="educational_talking_head") {
        console.log("[classification override]");
        console.log(JSON.stringify({
          previousType,
          newType:"educational_talking_head",
          reason:healthcareEvidence ? "healthcare human-scene explainer evidence" : "human-scene speaking or presenting evidence",
        },null,2));
      }
      return "educational_talking_head";
    }
    const foodEvidence=[
      safeFacts.content_type,
      safeFacts.scene_purpose,
      safeFacts.activity_context,
      safeFacts.content_theme,
      safeFacts.overlay_topic,
      safeFacts.primary_object,
      safeFacts.hero_element,
      safeFacts.product_identity,
      safeFacts.food_focus,
    ].join(" ");
    const motionEvidence=[
      safeFacts.visible_motion_cues,
      safeFacts.subject_motion,
      safeFacts.inferred_motion,
      safeFacts.pose_action,
      safeFacts.activity_context,
    ].join(" ");
    const foodPrepMotion=/\b(spread|spreading|apply|applying|pour|pouring|mix|mixing|stir|stirring|cook|cooking|prepare|preparing|slice|slicing|chop|chopping|toast|toasting|serve|serving|scoop|scooping|drizzle|drizzling)\b/i.test(motionEvidence);
    const foodBranding=usableFact(safeFacts.product_identity)&&/\b(food|bread|spread|butter|peanut|chocolate|coffee|snack|sauce|drink|beverage|protein|nutrition|cream|cookie|cake|topping)\b/i.test(foodEvidence);
    if(safeFacts.content_type==="food"&&foodPrepMotion) {
      if(previousType!=="food_preparation") {
        console.log("[classification override]");
        console.log(JSON.stringify({
          previousType,
          newType:"food_preparation",
          reason:"food content with visible preparation motion",
        },null,2));
      }
      return "food_preparation";
    }
    if(foodBranding) {
      if(previousType!=="food_product_showcase") {
        console.log("[classification override]");
        console.log(JSON.stringify({
          previousType,
          newType:"food_product_showcase",
          reason:"food branding or product identity evidence",
        },null,2));
      }
      return "food_product_showcase";
    }
    return previousType;
  }catch(e){
    dbg?.err?.("reel classification","reel type derivation failed",e);
    return "other";
  }
}

async function deriveScreenIntelligence(factual,dbg) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  if(!["screen_recording","ui_screenshot"].includes(contentType)) {
    return {screen_context:"",interaction_type:"",workflow_stage:""};
  }
  const safeFacts={
    content_type:contentType,
    overlay_text:cleanFact(factual?.overlay_text),
    overlay_topic:cleanFact(factual?.overlay_topic),
    environment:cleanFact(factual?.environment),
    surfaces:cleanFact(factual?.surfaces),
    subjects:cleanFact(factual?.subjects),
    scene_purpose:cleanFact(factual?.scene_purpose),
    activity_context:cleanFact(factual?.activity_context),
    content_theme:cleanFact(factual?.content_theme),
    spoken_topic:cleanFact(factual?.spoken_topic),
    speaker_intent:cleanFact(factual?.speaker_intent),
  };
  const sysPrompt="You classify visible software screen context from OCR, UI facts, and speech topic. Return only valid JSON.";
  const prompt=`Extract screen intelligence from these facts only.

Allowed screen_context examples:
AI image generation platform, AI video generation platform, chat application, analytics dashboard, website builder, e-commerce website, social media platform, productivity workspace, code editor, video editor, photo editor, mobile application, browser interface, search engine, unknown software interface.

Allowed interaction_type examples:
prompt editing, content generation, workflow configuration, parameter adjustment, navigation, product browsing, chat interaction, dashboard review, document editing, code editing, file management, content publishing, tutorial walkthrough.

Allowed workflow_stage examples:
setup, configuration, generation, editing, review, analysis, publishing, results inspection, content consumption.

Rules:
- Return only valid JSON.
- Use overlay_text, overlay_topic, visible interface facts, spoken_topic, and speaker_intent.
- Do not use or infer from raw transcript.
- Do not invent software names, buttons, features, menus, or branding.
- If unclear, use generic labels such as unknown software interface, navigation, or review.

Facts:
${JSON.stringify(safeFacts)}

Return:
{
  "screen_context": "",
  "interaction_type": "",
  "workflow_stage": ""
}`;
  try{
    const raw=await callAI(prompt,sysPrompt,[],dbg);
    const parsed=extractJSON(raw,"ScreenContext");
    return {
      screen_context:cleanFact(parsed?.screen_context),
      interaction_type:cleanFact(parsed?.interaction_type),
      workflow_stage:cleanFact(parsed?.workflow_stage),
    };
  }catch(e){
    dbg?.err?.("screen intelligence","screen intelligence derivation failed",e);
    return {screen_context:"",interaction_type:"",workflow_stage:""};
  }
}

async function deriveWorkflowDomain(factual,dbg) {
  const contentType=cleanFact(factual?.content_type).toLowerCase();
  if(!["screen_recording","ui_screenshot"].includes(contentType)) {
    return {workflow_domain:"",confidence_workflow_domain:0};
  }
  const allowed=[
    "AI content creation",
    "AI image generation",
    "AI video generation",
    "AI writing assistant",
    "graphic design",
    "video editing",
    "photo editing",
    "software development",
    "website development",
    "data analytics",
    "e-commerce",
    "marketing",
    "social media management",
    "content publishing",
    "education",
    "productivity",
    "communication",
    "project management",
    "finance",
    "customer support",
    "browser research",
    "general software",
    "unknown",
  ];
  const safeFacts={
    content_type:contentType,
    screen_context:cleanFact(factual?.screen_context),
    interaction_type:cleanFact(factual?.interaction_type),
    workflow_stage:cleanFact(factual?.workflow_stage),
    overlay_text:cleanFact(factual?.overlay_text),
    overlay_topic:cleanFact(factual?.overlay_topic),
    spoken_topic:cleanFact(factual?.spoken_topic),
    speaker_intent:cleanFact(factual?.speaker_intent),
  };
  const sysPrompt="You classify software screen recordings into a workflow domain using OCR, UI context, and speech topic. Return only valid JSON.";
  const prompt=`Choose one workflow_domain from this allowed list:
${allowed.join(", ")}

Rules:
- Return only valid JSON.
- Use screen_context, interaction_type, workflow_stage, overlay_topic, OCR text, spoken_topic, and speaker_intent.
- Do not use or infer from raw transcript.
- Do not invent software names, products, brands, or platform identities.
- If unclear, use "unknown".
- Confidence rules: 1.0 for strong OCR plus UI evidence, 0.7 for strong visual/UI evidence, 0.4 for weak inference, 0 for unknown.

Examples:
- AI image prompts -> AI image generation
- video model settings -> AI video generation
- chat assistant workflow -> AI writing assistant
- code editor and programming terms -> software development
- shopping/product pages -> e-commerce
- analytics dashboards -> data analytics
- Canva-style layouts -> graphic design
- YouTube publishing workflow -> content publishing

Facts:
${JSON.stringify(safeFacts)}

Return:
{
  "workflow_domain": "unknown",
  "confidence_workflow_domain": 0
}`;
  try{
    const raw=await callAI(prompt,sysPrompt,[],dbg);
    const parsed=extractJSON(raw,"WorkflowDomain");
    const domain=cleanFact(parsed?.workflow_domain);
    const confidence=Math.max(0,Math.min(1,Number(parsed?.confidence_workflow_domain)||0));
    return {
      workflow_domain:allowed.includes(domain) ? domain : "unknown",
      confidence_workflow_domain:domain==="unknown" ? 0 : confidence,
    };
  }catch(e){
    dbg?.err?.("workflow domain","workflow domain derivation failed",e);
    return {workflow_domain:"unknown",confidence_workflow_domain:0};
  }
}

function deriveConfidenceScores(factual) {
  const hasProductIdentity=hasUsableFact(factual?.product_identity);
  const hasOcr=hasUsableFact(factual?.overlay_text)||hasUsableFact(factual?.overlay_topic);
  const hasSpeech=hasUsableFact(factual?.spoken_topic)||hasUsableFact(factual?.speaker_intent);
  const hasObject=hasUsableFact(factual?.primary_object)||hasUsableFact(factual?.hero_element);
  const hasVisualScene=hasUsableFact(factual?.environment)&&hasUsableFact(factual?.lighting);
  const hasSemantic=Object.values(semanticSceneContext(factual)).some(hasUsableFact);
  const reelType=cleanFact(factual?.reel_type);

  let confidenceProductIdentity=0;
  if(hasProductIdentity&&hasOcr&&hasSpeech) confidenceProductIdentity=1.0;
  else if(hasProductIdentity&&hasOcr) confidenceProductIdentity=1.0;
  else if(hasProductIdentity&&hasObject) confidenceProductIdentity=0.7;
  else if(hasProductIdentity) confidenceProductIdentity=0.4;

  let confidenceReelType=0;
  if(reelType&&reelType!=="other") {
    if(hasVisualScene&&(hasOcr||hasSpeech||hasSemantic)) confidenceReelType=1.0;
    else if(hasVisualScene||hasSemantic) confidenceReelType=0.7;
    else confidenceReelType=0.4;
  }

  let confidenceSemanticScene=0;
  if(hasSemantic) {
    if(hasVisualScene&&(hasOcr||hasSpeech)) confidenceSemanticScene=1.0;
    else if(hasVisualScene) confidenceSemanticScene=0.7;
    else confidenceSemanticScene=0.4;
  }

  return {
    confidence_product_identity:confidenceProductIdentity,
    confidence_reel_type:confidenceReelType,
    confidence_semantic_scene:confidenceSemanticScene,
  };
}

function coerceStage1Object(parsed) {
  const isArray=Array.isArray(parsed);
  console.log("[Stage1 response type]");
  console.log(JSON.stringify({isArray,length:isArray ? parsed.length : undefined},null,2));
  if(!isArray) return parsed;
  console.log("[Stage1 array response detected]");
  const firstObject=parsed.find(item=>item&&typeof item==="object"&&!Array.isArray(item));
  return firstObject||{};
}

// - AI PROVIDERS -
async function callGemini(prompt,sysPrompt,images) {
  const key=process.env.GEMINI_API_KEY;
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
  const isPromptGeneration=images.length===0;
  const maxOutputTokens=isPromptGeneration?8192:4096;
  const parts=[];
  for(const img of images) {
    if(img.base64) parts.push({inlineData:{mimeType:img.mimeType,data:img.base64}});
  }
  parts.push({text:sysPrompt+"\n\n"+prompt});
  const body=JSON.stringify({
    contents:[{parts}],
    generationConfig:{temperature:0.2,maxOutputTokens,responseMimeType:"application/json"}
  });
  return new Promise((res,rej)=>{
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const req=https.request(url,{
      method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)}
    },r=>{
      const chunks=[];
      r.on("data",c=>chunks.push(c));
      r.on("end",()=>{
        try{
          const d=JSON.parse(Buffer.concat(chunks).toString());
          if(d.error) return rej(new Error("Gemini API error: "+d.error.message));
          const candidate=d.candidates?.[0]||{};
          const textParts=candidate.content?.parts?.map(p=>p.text||"").filter(Boolean)||[];
          const text=textParts.join("");
          lastAIResponseMeta={
            provider:"gemini",
            model,
            maxOutputTokens,
            candidateCount:d.candidates?.length||0,
            textPartCount:textParts.length,
            finishReason:candidate.finishReason||null,
            finishMessage:candidate.finishMessage||null,
            promptTokenCount:d.usageMetadata?.promptTokenCount??null,
            candidatesTokenCount:d.usageMetadata?.candidatesTokenCount??null,
            totalTokenCount:d.usageMetadata?.totalTokenCount??null,
            rawTextLength:text.length,
          };
          res(text);
        }catch(e){rej(new Error("Gemini parse: "+e.message));}
      });
      r.on("error",rej);
    });
    req.on("error",rej);
    req.setTimeout(90000,()=>{req.destroy();rej(new Error("Gemini timeout"));});
    req.write(body);req.end();
  });
}

async function callClaude(prompt,sysPrompt,images) {
  const Anthropic=require("@anthropic-ai/sdk");
  const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
  const content=images.filter(i=>i.base64).map(i=>({
    type:"image",source:{type:"base64",media_type:i.mimeType,data:i.base64}
  }));
  content.push({type:"text",text:prompt});
  const r=await client.messages.create({
    model:"claude-opus-4-20250514",max_tokens:2048,system:sysPrompt,
    messages:[{role:"user",content}]
  });
  return r.content[0]?.text||"";
}

async function callAI(prompt,sysPrompt,images,dbg) {
  if(process.env.GEMINI_API_KEY){dbg.log("ai","Gemini "+(process.env.GEMINI_MODEL||"gemini-2.5-flash"));return callGemini(prompt,sysPrompt,images);}
  if(process.env.ANTHROPIC_API_KEY){dbg.log("ai","Claude");return callClaude(prompt,sysPrompt,images);}
  throw new Error("No AI key. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env");
}

async function callGemini(prompt,sysPrompt,images) {
  const key=process.env.GEMINI_API_KEY;
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
  const isPromptGeneration=images.length===0;
  const maxOutputTokens=isPromptGeneration?8192:4096;
  const parts=[];
  for(const img of images) {
    if(img.base64) parts.push({inlineData:{mimeType:img.mimeType,data:img.base64}});
  }
  parts.push({text:sysPrompt+"\n\n"+prompt});
  const body=JSON.stringify({
    contents:[{parts}],
    generationConfig:{temperature:0.2,maxOutputTokens,responseMimeType:"application/json"}
  });
  return new Promise((res,rej)=>{
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const req=https.request(url,{
      method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)}
    },r=>{
      const chunks=[];
      r.on("data",c=>chunks.push(c));
      r.on("end",()=>{
        try{
          const d=JSON.parse(Buffer.concat(chunks).toString());
          if(d.error) return rej(new Error("Gemini API error: "+d.error.message));
          const candidate=d.candidates?.[0]||{};
          const textParts=candidate.content?.parts?.map(p=>p.text||"").filter(Boolean)||[];
          const text=textParts.join("");
          lastAIResponseMeta={
            provider:"gemini",
            model,
            maxOutputTokens,
            candidateCount:d.candidates?.length||0,
            textPartCount:textParts.length,
            finishReason:candidate.finishReason||null,
            finishMessage:candidate.finishMessage||null,
            promptTokenCount:d.usageMetadata?.promptTokenCount??null,
            candidatesTokenCount:d.usageMetadata?.candidatesTokenCount??null,
            totalTokenCount:d.usageMetadata?.totalTokenCount??null,
            rawTextLength:text.length,
          };
          res(text);
        }catch(e){rej(new Error("Gemini parse: "+e.message));}
      });
      r.on("error",rej);
    });
    req.on("error",rej);
    req.setTimeout(90000,()=>{req.destroy();rej(new Error("Gemini timeout"));});
    req.write(body);req.end();
  });
}

async function callClaude(prompt,sysPrompt,images) {
  const Anthropic=require("@anthropic-ai/sdk");
  const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
  const content=images.filter(i=>i.base64).map(i=>({
    type:"image",source:{type:"base64",media_type:i.mimeType,data:i.base64}
  }));
  content.push({type:"text",text:prompt});
  const r=await client.messages.create({
    model:"claude-opus-4-20250514",max_tokens:2048,system:sysPrompt,
    messages:[{role:"user",content}]
  });
  return r.content[0]?.text||"";
}

async function callAI(prompt,sysPrompt,images,dbg) {
  if(process.env.GEMINI_API_KEY){dbg.log("ai","Gemini "+(process.env.GEMINI_MODEL||"gemini-2.5-flash"));return callGemini(prompt,sysPrompt,images);}
  if(process.env.ANTHROPIC_API_KEY){dbg.log("ai","Claude");return callClaude(prompt,sysPrompt,images);}
  throw new Error("No AI key. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env");
}

function wordCount(s) {
  return String(s||"").trim().split(/\s+/).filter(Boolean).length;
}

function detectAbstractActionPhrase(s) {
  const match=String(s||"").match(/\b(speaking|explaining|presenting|demonstrating|teaching|showing|reviewing|walking|running|dancing|posing|gesturing|pointing|cooking|preparing|typing|editing|browsing|interacting|using|operating|examining|holding|displaying)\b/i);
  return match ? match[1].toLowerCase() : "";
}

function hasMotionLanguage(s) {
  return /\b(breath|breathes|breathing|blink|blinks|blinking|shift|shifts|shifting|tilt|tilting|turn|turns|turning|gesture|gestures|gesturing|move|moves|moving|movement|motion|raise|raises|raising|cover|covers|covering|close|closes|closing|open|opens|opening|smile|smiles|smiling|grin|grins|grinning|laugh|laughs|laughing|narrow|narrows|narrowing|expression|expressions|react|reacts|reacting|drift|flutter|sway|settle|settles|settling|walk|walks|walking|step|steps|stepping|glide|glides|gliding|flow|flows|flowing|breeze|hair|fabric|push-in|push in|slider|tracking|tracking shot|pan|panning|orbit|orbiting|zoom|zooms|zooming|zoom-in|zoom in|transition|transitions|transitioning|reframe|reframes|reframing|camera move|camera movement|speaking|explaining|presenting|demonstrating|teaching|showing|reviewing|running|dancing|posing|pointing|cooking|preparing|typing|editing|browsing|interacting|using|operating|examining|holding|displaying)\b/i.test(String(s||""));
}

if(process.env.VIBEPROMPT_DEBUG_MOTION==="1") {
  const input="Execute a gentle lateral slider movement,\nwith a subtle cinematic push-in.\nNatural breathing and subtle posture shifts.";
  console.log("[motion debug input]",input);
  console.log("[motion debug detected]",hasMotionLanguage(input));
}

function hasStaticCompositionLanguage(s) {
  return /\b(static|still|stillness|locked-off|locked off|composition|composed|framing|held frame|stationary|no visible motion|still environment)\b/i.test(String(s||""));
}

function hasCameraLanguage(s) {
  return /\b(camera|framing|frame|lens|push-in|push in|slider|tracking|handheld|locked-off|composition|depth of field|bokeh|close-up|portrait|wide|medium)\b/i.test(String(s||""));
}

function hasSpeechAudioLanguage(s) {
  return /\b(speech|speaks|speaking|speaker|spoken|dialogue|voice|voiceover|talks|talking|narration|narrator|says|presenter)\b/i.test(String(s||""));
}

function hasMusicAudioLanguage(s) {
  return /\b(music|musical|song|soundtrack|score|beat|rhythm|pop music|orchestral|electronic music|cinematic music|ambient music|background music)\b/i.test(String(s||""));
}

function hasAmbientAudioLanguage(s) {
  return /\b(ambient audio|ambient sound|ambience|cafe ambience|street traffic|nature ambience|office ambience|crowd ambience|environmental audio|environmental sound)\b/i.test(String(s||""));
}

function hasCaptionLikeOpening(s) {
  return /^(a|an|the)\s+(woman|girl|model|person|man|boy|subject)\s+(sits|stands|is|wears|poses|looks)\b/i.test(String(s||"").trim());
}

function hasImageMotionTerms(s) {
  return /\b(dolly|tracking|push-in|push in|orbit|crane|scene progression|camera moves|camera movement|slider movement|handheld drift)\b/i.test(String(s||""));
}

function repeatedPromptStructure(prompts, fields) {
  const starts=fields
    .map(f=>String(prompts[f]||"").trim().split(/\s+/).slice(0,5).join(" ").toLowerCase())
    .filter(Boolean);
  return starts.some((s,i)=>starts.indexOf(s)!==i);
}

// Validate prompt completeness and quality.
function validatePrompts(parsed, mediaType) {
  const issues = [];
  const p = parsed.prompts || {};
  const factual = parsed.factual || parsed.analysis || {};
  const isVideo = mediaType === "video";
  const motionUnknown = isVideo && motionUnknownFromFacts(factual);

  const promptFields = isVideo
    ? ["runway","sora","pika","kling","veo"]
    : ["flux","midjourney","nano_banana","imagen","recraft","sdxl"];
  const requiredFields = isVideo
    ? [...promptFields, "keyframe", "negative", "camera_spec", "style_tags"]
    : [...promptFields, "negative", "camera_spec", "style_tags"];

  for (const field of requiredFields) {
    const val = p[field];
    if (Array.isArray(val)) {
      if (val.length === 0 || val.some(v => !String(v||"").trim())) issues.push(`${field}: empty array item`);
      continue;
    }
    const minLength = field==="camera_spec" ? 1 : 20;
    if (!val || String(val).trim().length < minLength) {
      issues.push(`${field}: empty or too short`);
      continue;
    }
    // Check ends with terminal punctuation
    const trimmed = String(val).trim();
    if (promptFields.includes(field) && !/[.!?]$/.test(trimmed)) {
      issues.push(`${field}: likely truncated`);
    }
    if(isVideo && promptFields.includes(field)) {
      if(wordCount(trimmed)<60) issues.push(`${field}: fewer than 60 words`);
      const actionPhrase=detectAbstractActionPhrase(trimmed);
      const motionAccepted=hasMotionLanguage(trimmed)||Boolean(actionPhrase)||(motionUnknown&&hasStaticCompositionLanguage(trimmed));
      console.log("[action-aware validation]");
      console.log(JSON.stringify({
        platform:field,
        detectedAbstractAction:Boolean(actionPhrase),
        actionPhrase,
        motionAccepted,
      },null,2));
      if(!motionAccepted) {
        issues.push(`${field}: missing motion description`);
      }
      if(!hasCameraLanguage(trimmed)) issues.push(`${field}: missing camera language`);
      if(hasCaptionLikeOpening(trimmed)) issues.push(`${field}: caption-like opening`);
      const audioType=cleanFact(factual?.audio_type).toLowerCase()||"none";
      const speechAudio=hasSpeechAudioLanguage(trimmed);
      const musicAudio=hasMusicAudioLanguage(trimmed);
      const ambientAudio=hasAmbientAudioLanguage(trimmed);
      if(audioType==="speech"&&!speechAudio) issues.push(`${field}: missing speech audio guidance`);
      if(audioType==="music"&&!musicAudio) issues.push(`${field}: missing music audio guidance`);
      if(audioType==="speech_and_music") {
        if(!speechAudio) issues.push(`${field}: missing speech audio guidance`);
        if(!musicAudio) issues.push(`${field}: missing music audio guidance`);
      }
      if(audioType==="ambient_audio"&&!ambientAudio) issues.push(`${field}: missing ambient audio guidance`);
      if(audioType==="none"&&(speechAudio||musicAudio)) issues.push(`${field}: invents dialogue or music audio`);
    }
    if(!isVideo && promptFields.includes(field) && hasImageMotionTerms(trimmed)) {
      issues.push(`${field}: contains video motion/camera language`);
    }
  }
  if(isVideo && repeatedPromptStructure(p,promptFields)) logPlatformSimilarity(p);
  return issues;
}

async function generatePromptJSONWithRetry({prompt,sysPrompt,images,mediaType,stage,dbg}) {
  let lastErr;
  for(let attempt=1;attempt<=2;attempt++) {
    if(stage==="Stage2"&&attempt===1) {
      const fullPrompt=sysPrompt+"\n\n"+prompt;
      const sections={
        systemChars:sysPrompt.length,
        userPromptChars:prompt.length,
        fullPromptChars:fullPrompt.length,
        approxTokens:Math.ceil(fullPrompt.length/4),
      };
      logStage2Debug("prompt size", sections);
    }
    const raw = await callAI(prompt, sysPrompt, images, dbg);
    dbg.log(stage, "Response", {attempt, chars:raw.length, preview:raw.slice(0,300)});
    if(stage==="Stage2") {
      logStage2Debug(`raw attempt ${attempt}`, raw);
      logStage2Debug(`Gemini metadata attempt ${attempt}`, lastAIResponseMeta||{});
    }
    try {
      const parsed = extractJSON(raw, stage);
      if(stage==="Stage2") logStage2Debug(`parsed attempt ${attempt}`, parsed);
      const issues = validatePrompts(parsed.prompts ? parsed : {prompts:parsed}, mediaType);
      if(issues.length) {
        if(stage==="Stage2") logStage2Debug(`validation errors attempt ${attempt}`, issues);
        throw new Error(`Prompt validation failed: ${issues.join("; ")}`);
      }
      return parsed;
    } catch(e) {
      if(stage==="Stage2") logStage2Debug(`error attempt ${attempt}`, e.message);
      lastErr = e;
      dbg.err(stage, `Attempt ${attempt} rejected`, e);
      if(attempt<2) dbg.log(stage, "Retrying generation once with same grounded inputs");
    }
  }
  return diagnostic("Prompt generation incomplete", lastErr?.message || `${stage} failed`, dbg, mediaType);
}

async function generateJSONWithRetry({prompt,sysPrompt,images,mediaType,stage,dbg,validate,errorTitle}) {
  let lastErr;
  for(let attempt=1;attempt<=2;attempt++) {
    const raw = await callAI(prompt, sysPrompt, images, dbg);
    dbg.log(stage, "Response", {attempt, chars:raw.length, preview:raw.slice(0,300)});
    if(stage==="Stage1") logStage1Debug(`raw attempt ${attempt}`, raw);
    if(stage==="Stage1") logStage1Debug(`metadata attempt ${attempt}`, lastAIResponseMeta||{});
    try {
      const parsed = stage==="Stage1" ? normalizeStage1Facts(coerceStage1Object(extractCompleteJSONObject(raw, stage))) : extractJSON(raw, stage);
      if(stage==="Stage1") logStage1Debug(`parsed attempt ${attempt}`, parsed);
      const issues = validate ? validate(parsed) : [];
      if(issues.length) {
        if(stage==="Stage1") logStage1Debug(`validation errors attempt ${attempt}`, issues);
        throw new Error(`${stage} validation failed: ${issues.join("; ")}`);
      }
      return parsed;
    } catch(e) {
      if(stage==="Stage1") logStage1Debug(`error attempt ${attempt}`, e.message);
      lastErr = e;
      dbg.err(stage, `Attempt ${attempt} rejected`, e);
      if(attempt<2) dbg.log(stage, "Retrying once with same inputs");
    }
  }
  return diagnostic(errorTitle || `${stage} incomplete`, lastErr?.message || `${stage} failed`, dbg, mediaType);
}

async function runAnalysis(images,mediaType,dbg,stylePreset,audioPayload={}) {
  dbg.log("analysis","Two-stage grounded multimodal",{images:images.length,mediaType,preset:stylePreset||"cinematic"});

  const stage1Facts = await generateJSONWithRetry({
    prompt:buildStage1Prompt(mediaType),
    sysPrompt:S1_SYSTEM,
    images,
    mediaType,
    stage:"Stage1",
    dbg,
    validate:validateFactualAnalysis,
    errorTitle:"Factual analysis incomplete",
  });
  if(stage1Facts.error) return stage1Facts;
  const speechAnalysis=await analyzeSpeech(images,mediaType,dbg,audioPayload);
  stage1Facts.speech_present=speechAnalysis.speech_present;
  stage1Facts.transcript=speechAnalysis.transcript||"";
  stage1Facts.speech_language=speechAnalysis.speech_language||"";
  stage1Facts.speech_language_confidence=Number(speechAnalysis.speech_language_confidence)||0;
  const transcriptQuality=estimateTranscriptQuality(stage1Facts.transcript,stage1Facts.speech_language_confidence);
  stage1Facts.confidence_speech=estimateSpeechConfidence(stage1Facts.transcript,stage1Facts.speech_present,stage1Facts.speech_language_confidence);
  const strongLanguageScript=stage1Facts.speech_language_confidence>=0.8&&/[\u0900-\u097F\u0600-\u06FF]/.test(stage1Facts.transcript);
  const suppressSpeech=stage1Facts.speech_present&&transcriptQuality.quality<0.3&&!strongLanguageScript;
  console.log("[speech suppression]");
  console.log(JSON.stringify({
    applied:suppressSpeech,
    reason:suppressSpeech ? "transcript quality below 0.3" : "",
  },null,2));
  const speechConfidenceLog={
    transcript_preview:stage1Facts.transcript.slice(0,120),
    confidence_speech:stage1Facts.confidence_speech,
  };
  console.log("[speech confidence]");
  console.log(JSON.stringify(speechConfidenceLog,null,2));
  dbg.log("speech confidence","Transcript confidence",speechConfidenceLog);
  const skipSpeechGrounding=stage1Facts.confidence_speech<0.5;
  if(skipSpeechGrounding) {
    console.log("[speech grounding skipped]");
    console.log(JSON.stringify({
      confidence_speech:stage1Facts.confidence_speech,
      reason:"below threshold",
    },null,2));
    dbg.log("speech grounding","Skipped speech topic grounding",{
      confidence_speech:stage1Facts.confidence_speech,
      reason:"below threshold",
    });
  }
  const speechTopic=speechAnalysis.speech_present&&!suppressSpeech&&!skipSpeechGrounding
    ? await summarizeSpeechTopic(stage1Facts.transcript,dbg)
    : {spoken_topic:"",speaker_intent:""};
  stage1Facts.spoken_topic=speechTopic.spoken_topic||"";
  stage1Facts.speaker_intent=speechTopic.speaker_intent||"";
  const speechGrounding={
    speech_present:stage1Facts.speech_present===true,
    spoken_topic:stage1Facts.spoken_topic,
    speaker_intent:stage1Facts.speaker_intent,
    applied:Boolean(stage1Facts.spoken_topic||stage1Facts.speaker_intent),
  };
  if(stage1Facts.speech_present) {
    console.log("[speech grounding]");
    console.log(JSON.stringify(speechGrounding,null,2));
    dbg.log("speech grounding","Stage2 speech topic context",speechGrounding);
  }
  const audioIntelligence=deriveAudioIntelligence(stage1Facts);
  stage1Facts.audio_type=audioIntelligence.audio_type;
  stage1Facts.audio_role=audioIntelligence.audio_role;
  stage1Facts.dialogue_summary=audioIntelligence.dialogue_summary;
  stage1Facts.music_mood=audioIntelligence.music_mood;
  stage1Facts.ambient_audio=audioIntelligence.ambient_audio;
  dbg.log("audio intelligence","Stage1 audio intelligence",audioIntelligence);
  console.log("[speech analysis]");
  console.log(JSON.stringify({
    speech_present:stage1Facts.speech_present,
    transcript_preview:stage1Facts.transcript.slice(0,120),
  },null,2));
  const ocrAnalysis={
    text_present:stage1Facts.text_present===true,
    overlay_text:stage1Facts.overlay_text||"",
    overlay_topic:stage1Facts.overlay_topic||"",
  };
  console.log("[ocr analysis]");
  console.log(JSON.stringify(ocrAnalysis,null,2));
  dbg.log("ocr analysis","Stage1 OCR fields",ocrAnalysis);
  const objectExtraction={
    primary_object:stage1Facts.primary_object||"",
    secondary_objects:Array.isArray(stage1Facts.secondary_objects)?stage1Facts.secondary_objects:[],
    hero_element:stage1Facts.hero_element||"",
    product_identity:stage1Facts.product_identity||"",
    food_focus:stage1Facts.food_focus||"",
  };
  console.log("[object extraction]");
  console.log(JSON.stringify(objectExtraction,null,2));
  dbg.log("object extraction","Stage1 object fields",objectExtraction);
  if(mediaType==="video") {
    const motionAnalysis={
      subject_motion:stage1Facts.subject_motion||"",
      camera_motion:stage1Facts.camera_motion||"",
      environmental_motion:stage1Facts.environmental_motion||"",
    };
    console.log("[motion analysis]");
    console.log(JSON.stringify(motionAnalysis,null,2));
    dbg.log("motion analysis","Stage1 motion fields",motionAnalysis);
  }
  const semanticScene=await deriveSemanticSceneUnderstanding(stage1Facts,dbg);
  stage1Facts.scene_purpose=semanticScene.scene_purpose||"";
  stage1Facts.activity_context=semanticScene.activity_context||"";
  stage1Facts.content_theme=semanticScene.content_theme||"";
  stage1Facts.audience_intent=semanticScene.audience_intent||"";
  console.log("[semantic scene understanding]");
  console.log(JSON.stringify(semanticSceneContext(stage1Facts),null,2));
  dbg.log("semantic scene understanding","Stage1 semantic fields",semanticSceneContext(stage1Facts));
  stage1Facts.reel_type=await deriveReelType(stage1Facts,dbg);
  console.log("[reel classification]");
  console.log(JSON.stringify(reelTypeContext(stage1Facts),null,2));
  dbg.log("reel classification","Stage1 reel type",reelTypeContext(stage1Facts));
  const reelEnergy=deriveReelEnergyIntelligence(stage1Facts);
  stage1Facts.reel_energy=reelEnergy.reel_energy||"";
  stage1Facts.performance_style=reelEnergy.performance_style||"";
  stage1Facts.social_aesthetic=reelEnergy.social_aesthetic||"";
  stage1Facts.motion_style=reelEnergy.motion_style||"";
  stage1Facts.viewer_feeling=reelEnergy.viewer_feeling||"";
  stage1Facts.camera_presence=reelEnergy.camera_presence||"";
  stage1Facts.music_sync_energy=reelEnergy.music_sync_energy||"";
  dbg.log("reel energy intelligence","Stage1 reel energy fields",reelEnergy);
  const motionEnergy=deriveMotionEnergyIntelligence(stage1Facts);
  stage1Facts.dance_energy=motionEnergy.dance_energy||"";
  stage1Facts.movement_density=motionEnergy.movement_density||"";
  stage1Facts.motion_rhythm=motionEnergy.motion_rhythm||"";
  stage1Facts.body_motion_style=motionEnergy.body_motion_style||"";
  stage1Facts.beat_sync_strength=motionEnergy.beat_sync_strength||"";
  stage1Facts.performance_intensity=motionEnergy.performance_intensity||"";
  stage1Facts.camera_engagement=motionEnergy.camera_engagement||"";
  stage1Facts.movement_continuity=motionEnergy.movement_continuity||"";
  stage1Facts.motion_focus=motionEnergy.motion_focus||"";
  dbg.log("motion energy intelligence","Stage1 motion energy fields",motionEnergy);
  const creatorArchetype=deriveCreatorArchetype(stage1Facts);
  stage1Facts.creator_archetype=creatorArchetype.creator_archetype||"";
  stage1Facts.creator_presence=creatorArchetype.creator_presence||"";
  stage1Facts.content_personality=creatorArchetype.content_personality||"";
  stage1Facts.social_platform_style=creatorArchetype.social_platform_style||"";
  stage1Facts.presentation_style=creatorArchetype.presentation_style||"";
  stage1Facts.viewer_relationship=creatorArchetype.viewer_relationship||"";
  dbg.log("creator archetype","Stage1 creator archetype fields",creatorArchetype);
  const temporalProgression=deriveTemporalReelProgression(stage1Facts);
  stage1Facts.temporal_opening=temporalProgression.temporal_opening||"";
  stage1Facts.temporal_progression=temporalProgression.temporal_progression||"";
  stage1Facts.temporal_continuity=temporalProgression.temporal_continuity||"";
  stage1Facts.moment_flow=temporalProgression.moment_flow||"";
  stage1Facts.scene_evolution=temporalProgression.scene_evolution||"";
  stage1Facts.performance_progression=temporalProgression.performance_progression||"";
  dbg.log("temporal progression intelligence","Stage1 temporal progression fields",temporalProgression);
  const attentionDirection=deriveAttentionDirectionIntelligence(stage1Facts);
  stage1Facts.primary_visual_focus=attentionDirection.primary_visual_focus||"";
  stage1Facts.secondary_visual_focus=attentionDirection.secondary_visual_focus||"";
  stage1Facts.attention_progression=attentionDirection.attention_progression||"";
  stage1Facts.focus_transition=attentionDirection.focus_transition||"";
  stage1Facts.camera_intention=attentionDirection.camera_intention||"";
  stage1Facts.visual_priority_flow=attentionDirection.visual_priority_flow||"";
  dbg.log("attention direction intelligence","Stage1 attention direction fields",attentionDirection);
  const screenIntel=await deriveScreenIntelligence(stage1Facts,dbg);
  stage1Facts.screen_context=screenIntel.screen_context||"";
  stage1Facts.interaction_type=screenIntel.interaction_type||"";
  stage1Facts.workflow_stage=screenIntel.workflow_stage||"";
  console.log("[screen intelligence]");
  console.log(JSON.stringify(screenContext(stage1Facts),null,2));
  dbg.log("screen intelligence","Stage1 screen fields",screenContext(stage1Facts));
  const workflowDomain=await deriveWorkflowDomain(stage1Facts,dbg);
  stage1Facts.workflow_domain=workflowDomain.workflow_domain||"";
  stage1Facts.confidence_workflow_domain=workflowDomain.confidence_workflow_domain||0;
  console.log("[workflow domain]");
  console.log(JSON.stringify({workflow_domain:stage1Facts.workflow_domain},null,2));
  dbg.log("workflow domain","Stage1 workflow domain",{workflow_domain:stage1Facts.workflow_domain});
  console.log("[workflow confidence]");
  console.log(JSON.stringify(workflowDomainContext(stage1Facts),null,2));
  dbg.log("workflow confidence","Stage1 workflow confidence",workflowDomainContext(stage1Facts));
  const confidenceScores=deriveConfidenceScores(stage1Facts);
  Object.assign(stage1Facts,confidenceScores);
  console.log("[confidence analysis]");
  console.log(JSON.stringify(confidenceContext(stage1Facts),null,2));
  dbg.log("confidence analysis","Stage1 confidence fields",confidenceContext(stage1Facts));

  const stage2Prompts = mediaType==="video"
    ? await generateVideoPromptsWithRetry(stage1Facts,stylePreset,mediaType,dbg)
    : await generateImagePromptsWithRetry(stage1Facts,stylePreset,mediaType,dbg);
  if(stage2Prompts.error) return stage2Prompts;

  const parsed = { factual:stage1Facts, prompts:stage2Prompts };

  // Validate prompt completeness
  const issues = validatePrompts(parsed, mediaType);
  if (issues.length > 0) {
    return diagnostic("Prompt generation incomplete", issues.join("; "), dbg, mediaType);
  } else {
    dbg.log("validate","All prompts complete");
  }

  // Normalize: handle {analysis,motion,prompts} (v4.4) or legacy {factual,prompts}
  const factual  = parsed.analysis || parsed.factual || parsed;
  const rawMotion = parsed.motion  || {};
  const rawPrompts = parsed.prompts || parsed;

  // Merge motion fields into prompts for downstream compatibility
  const prompts = {
    ...rawPrompts,
    motion_score:        rawMotion.score              || rawPrompts.motion_score || (mediaType==="video"?65:10),
    camera_motion:       rawMotion.camera_motion      || rawPrompts.camera_motion || "",
    environmental_motion:rawMotion.environmental_motion|| rawPrompts.environmental_motion || "",
    scene_progression:   rawMotion.scene_progression  || rawPrompts.scene_progression || "",
    camera_spec:         rawMotion.camera_spec        || rawPrompts.camera_spec || "",
  };

  dbg.log("done","Complete",{ms:dbg.summary().totalMs});
  return {
    factual,
    prompts,
    debug:dbg.summary(),
    model:process.env.GEMINI_API_KEY?(process.env.GEMINI_MODEL||"gemini-2.5-flash"):"claude",
    analysisMode:"two-stage-grounded-v1",
    stylePreset:stylePreset||"cinematic",
    mediaType,
  };
}

// - PUBLIC API -
async function analyzeVideoFrames(framePaths,jobDir,stylePreset) {
  const dbg=new PipelineDebugger();
  const loaded=[];
  for(let i=0;i<Math.min(framePaths.length,5);i++) {
    try{loaded.push(await loadImage(framePaths[i],dbg));}
    catch(e){dbg.err("load","Frame "+i,e);}
  }
  if(!loaded.length) throw Object.assign(new Error("No frames loaded"),{debug:dbg.summary()});
  return runAnalysis(loaded,"video",dbg,stylePreset);
}

async function analyzeImageUrl(url,stylePreset) {
  const dbg=new PipelineDebugger();
  let img;
  try{img=await loadImage(url,dbg);}
  catch(e){dbg.err("load","Failed",e);throw Object.assign(e,{debug:dbg.summary()});}
  return runAnalysis([img],"image",dbg,stylePreset);
}

async function analyzeImageBase64(base64,mimeType,mediaType,stylePreset,audioPayload={}) {
  const dbg=new PipelineDebugger();
  if(!base64||base64.length<500) throw Object.assign(new Error("base64 too small - frame capture failed"),{debug:dbg.summary()});

  // Validate frame quality before sending to AI (catches black/blank frames)
  const validation = validateImageData(base64, dbg);
  if (!validation.valid) {
    throw Object.assign(
      new Error(validation.reason || "Invalid frame captured"),
      { debug: dbg.summary(), captureDebug: validation, isFrameError: true }
    );
  }

  const img={base64,mimeType:mimeType||"image/jpeg",sizeKB:validation.sizeKB||Math.round(base64.length*0.75/1024)};
  dbg.log("init","base64",{kb:img.sizeKB,mime:img.mimeType,mediaType,preset:stylePreset,variance:validation.variance});
  return runAnalysis([img],mediaType||"image",dbg,stylePreset,audioPayload);
}

async function analyzeImageFramesBase64(imageFrames,mediaType,stylePreset,audioPayload={}) {
  const dbg=new PipelineDebugger();
  const frames=Array.isArray(imageFrames)?imageFrames:[];
  console.log("[frames captured]");
  console.log(frames.length);
  console.log("[frame timestamps]");
  console.log(JSON.stringify(frames.map(f=>f?.timestamp).filter(t=>t!==undefined)));
  dbg.log("init","imageFrames",{
    count:frames.length,
    timestamps:frames.map(f=>f?.timestamp).filter(t=>t!==undefined),
    mediaType,
    preset:stylePreset,
  });

  const loaded=[];
  for(let i=0;i<frames.length;i++) {
    const frame=frames[i]||{};
    const base64=frame.base64;
    if(!base64||base64.length<500) {
      dbg.err("validate",`Frame ${i}`,new Error("base64 too small - frame capture failed"));
      continue;
    }
    const validation=validateImageData(base64,dbg);
    if(!validation.valid) {
      dbg.err("validate",`Frame ${i}`,new Error(validation.reason||"Invalid frame captured"));
      continue;
    }
    loaded.push({
      base64,
      mimeType:frame.mimeType||"image/jpeg",
      sizeKB:validation.sizeKB||Math.round(base64.length*0.75/1024),
      timestamp:frame.timestamp,
    });
  }
  if(!loaded.length) {
    throw Object.assign(new Error("No valid frames captured"),{debug:dbg.summary(),isFrameError:true});
  }
  return runAnalysis(loaded,mediaType||"video",dbg,stylePreset,audioPayload);
}

module.exports={analyzeVideoFrames,analyzeImageUrl,analyzeImageBase64,analyzeImageFramesBase64};

