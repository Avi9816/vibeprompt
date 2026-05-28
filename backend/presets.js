// VibePrompt Style Presets
"use strict";

const PRESETS = {
  cinematic: {
    label: "Cinematic",
    lighting: "dramatic cinematic lighting with deep shadows and rich contrast",
    lens: "anamorphic lens, 2.39:1 aspect ratio, subtle lens flare",
    grade: "film-grade color, muted highlights, teal-orange grade",
    pace: "slow deliberate cinematic pacing with natural motion blur",
    suffix: "Shot on ARRI Alexa with spherical 50mm lens. Ultra-realistic cinematic commercial aesthetic.",
  },
  luxury: {
    label: "Luxury",
    lighting: "premium soft-box lighting, polished highlights, zero harsh shadows",
    lens: "85mm portrait compression, razor-thin depth of field",
    grade: "warm neutral palette, creamy skin tones, high-end magazine finish",
    pace: "elegant slow motion, refined movement, no abrupt cuts",
    suffix: "Shot on Hasselblad medium format. Luxury fashion editorial aesthetic. Ultra polished.",
  },
  fashion: {
    label: "Fashion Editorial",
    lighting: "editorial mixed lighting, soft overcast outdoor or controlled studio strobe",
    lens: "35mm wide portrait, slight environmental context, editorial framing",
    grade: "desaturated clean tones, Vogue editorial palette",
    pace: "confident purposeful movement, model-aware posture, editorial energy",
    suffix: "Shot on Phase One IQ4. High-fashion editorial aesthetic.",
  },
  viral: {
    label: "Viral Reel",
    lighting: "natural bright daylight or ring-lit selfie lighting, punchy colors",
    lens: "wide angle 24mm, slight perspective distortion, selfie-proximity feel",
    grade: "high saturation, vibrant warm tones, social-media-optimized palette",
    pace: "fast dynamic movement, quick energy, engaging micro-expressions",
    suffix: "Shot on iPhone Pro ProRes. High-energy creator aesthetic.",
  },
  documentary: {
    label: "Documentary",
    lighting: "available natural light, realistic shadows, unmanipulated exposure",
    lens: "24-70mm zoom range, natural handheld character",
    grade: "neutral realistic grade, true-to-life colors, no heavy processing",
    pace: "observational timing, natural human rhythm, authentic spontaneous feel",
    suffix: "Shot on Sony FX6 handheld. Authentic documentary aesthetic.",
  },
  cyberpunk: {
    label: "Cyberpunk",
    lighting: "neon-saturated light spill in magenta, cyan and electric blue, rain-slicked reflections",
    lens: "wide 21mm, dramatic low angle, lens flares from neon sources",
    grade: "high-contrast neon palette, dark crushed blacks, glowing highlights",
    pace: "atmospheric slow push with environmental motion, rain particles, steam vents",
    suffix: "Shot on RED Komodo. Blade Runner 2049 / Cyberpunk 2077 cinematic aesthetic.",
  },
  anime: {
    label: "Anime",
    lighting: "stylized rim lighting, cel-shaded shadows, bright saturated key light",
    lens: "slightly exaggerated focal perspective, clean compositional framing",
    grade: "vivid saturated anime palette, clean color separations",
    pace: "expressive fluid movement, anticipation frames, dynamic action energy",
    suffix: "Anime cinematic aesthetic. Studio Ghibli / Makoto Shinkai visual style.",
  },
};

function getPreset(name) {
  return PRESETS[name] || PRESETS.cinematic;
}

function listPresets() {
  return Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label }));
}

module.exports = { getPreset, listPresets, PRESETS };
