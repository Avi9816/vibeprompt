// VibePrompt Prompt Generator v4.3
"use strict";

function generatePrompts(analysisResult, mediaType) {
  const {factual,prompts:p,debug,model,analysisMode,stylePreset}=analysisResult;
  const isVideo=mediaType==="video";

  // Primary: video tools first for video, image tools for stills
  const primaryPrompt=isVideo
    ?(p?.runway||p?.sora||p?.kling||p?.universal||"")
    :(p?.flux||p?.keyframe||p?.midjourney||"");

  const scene={
    subject:     factual?.subjects||"",
    action:      factual?.inferred_motion||factual?.pose_action||"",
    camera:      p?.camera_spec||factual?.lens_feel||"",
    lighting:    factual?.lighting||"",
    environment: factual?.environment||"",
    style:       factual?.image_characteristics||"",
    mood:        factual?.mood_atmosphere||"",
    clothing:    factual?.clothing_top||"",
  };

  return {
    scene,
    prompts:{
      primary:    primaryPrompt,
      runway:     p?.runway     ||"",
      sora:       p?.sora       ||"",
      pika:       p?.pika       ||"",
      kling:      p?.kling      ||"",
      veo:        p?.veo        ||"",
      flux:       p?.flux       ||"",
      midjourney: p?.midjourney ||"",
      keyframe:   p?.keyframe   ||"",
    },
    negative:           p?.negative           ||"",
    cameraSpec:         p?.camera_spec        ||"",
    motionScore:        parseInt(p?.motion_score||p?.motion_intensity)||( isVideo?65:15 ),
    sceneProgression:   p?.scene_progression  ||"",
    cameraMotion:       p?.camera_motion      ||"",
    environmentalMotion:p?.environmental_motion||"",
    styleTags:          p?.style_tags         ||[],
    stylePreset:        stylePreset           ||"cinematic",
    mediaType,
    factual,
    debug,
    model,
    analysisMode,
    generatedAt:new Date().toISOString(),
  };
}

module.exports={generatePrompts};
