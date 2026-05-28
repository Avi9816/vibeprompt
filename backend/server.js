// VibePrompt Server v4.3
"use strict";
try{require("dotenv").config();}catch{}

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");
const { analyzeVideoFrames, analyzeImageUrl, analyzeImageBase64, analyzeImageFramesBase64 } = require("./analyzer");
const { generatePrompts } = require("./promptGenerator");
const { listPresets }     = require("./presets");

const app  = express();
const PORT = process.env.PORT||3000;
const FEEDBACK_DIR = path.join(__dirname,"prompt_feedback");
const ISSUE_TAGS = new Set([
  "wrong motion",
  "wrong dialogue",
  "wrong lighting",
  "wrong camera",
  "too generic",
  "too cinematic",
  "inaccurate environment",
  "inaccurate subject",
  "poor audio recreation",
]);

function ensureFeedbackDir() {
  fs.mkdirSync(FEEDBACK_DIR,{recursive:true});
}

function confidenceScoresFromBody(body={}) {
  const scores=body.confidence_scores||{};
  return {
    product_identity:Number(scores.product_identity??scores.confidence_product_identity??0)||0,
    reel_type:Number(scores.reel_type??scores.confidence_reel_type??0)||0,
    semantic_scene:Number(scores.semantic_scene??scores.confidence_semantic_scene??0)||0,
    speech:Number(scores.speech??scores.confidence_speech??0)||0,
    workflow_domain:Number(scores.workflow_domain??scores.confidence_workflow_domain??0)||0,
  };
}

function sanitizeFeedbackEntry(body={}) {
  const rating=Math.max(1,Math.min(5,Number(body.rating)||0));
  if(!rating) throw new Error("rating must be 1-5");
  const issueTags=Array.isArray(body.issue_tags)
    ? body.issue_tags.map(t=>String(t||"").trim()).filter(t=>ISSUE_TAGS.has(t))
    : [];
  return {
    timestamp:new Date().toISOString(),
    platform:String(body.platform||"").trim().toLowerCase()||"unknown",
    reel_type:String(body.reel_type||"").trim()||"other",
    prompt:String(body.prompt||"").trim(),
    master_prompt:String(body.master_prompt||"").trim(),
    rating,
    issue_tags:issueTags,
    audio_type:String(body.audio_type||"none").trim()||"none",
    speech_language:String(body.speech_language||"").trim(),
    confidence_scores:confidenceScoresFromBody(body),
  };
}

function promptWeaknesses(entry) {
  const text=String(entry.prompt||"").toLowerCase();
  const weaknesses=[];
  if(entry.rating<=2) weaknesses.push("low rating");
  if(text.length&&text.split(/\s+/).filter(Boolean).length<45) weaknesses.push("short prompt");
  if(/\b(shows|depicts|contains|features)\b/.test(text)) weaknesses.push("descriptive wording");
  if(entry.issue_tags?.length) weaknesses.push(...entry.issue_tags);
  return weaknesses;
}

function averageBy(entries,key) {
  const buckets={};
  for(const entry of entries) {
    const name=entry[key]||"unknown";
    if(!buckets[name]) buckets[name]={count:0,total:0,average:0};
    buckets[name].count+=1;
    buckets[name].total+=Number(entry.rating)||0;
  }
  for(const bucket of Object.values(buckets)) {
    bucket.average=Number((bucket.total/Math.max(bucket.count,1)).toFixed(2));
    delete bucket.total;
  }
  return buckets;
}

function analyzePromptFeedback() {
  ensureFeedbackDir();
  const entries=fs.readdirSync(FEEDBACK_DIR)
    .filter(name=>name.endsWith(".json"))
    .map(name=>{
      try{return JSON.parse(fs.readFileSync(path.join(FEEDBACK_DIR,name),"utf8"));}
      catch{return null;}
    })
    .filter(Boolean);
  const tagCounts={};
  const weaknessCounts={};
  for(const entry of entries) {
    for(const tag of entry.issue_tags||[]) tagCounts[tag]=(tagCounts[tag]||0)+1;
    for(const weakness of promptWeaknesses(entry)) weaknessCounts[weakness]=(weaknessCounts[weakness]||0)+1;
  }
  return {
    total_entries:entries.length,
    average_ratings_by_platform:averageBy(entries,"platform"),
    average_ratings_by_reel_type:averageBy(entries,"reel_type"),
    common_failure_tags:Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).map(([tag,count])=>({tag,count})),
    common_prompt_weaknesses:Object.entries(weaknessCounts).sort((a,b)=>b[1]-a[1]).map(([weakness,count])=>({weakness,count})),
  };
}

app.use(cors({origin:(o,cb)=>cb(null,true),methods:["GET","POST","OPTIONS"],allowedHeaders:["Content-Type"]}));
app.use(express.json({limit:"25mb"}));

app.use((req,_,next)=>{
  if(req.method!=="OPTIONS"){
    console.log("\n"+"-".repeat(55));
    console.log(`-> ${req.method} ${req.path}`);
    if(req.body?.imageBase64) console.log(`   base64: ${Math.round(req.body.imageBase64.length/1024)}KB`);
    if(Array.isArray(req.body?.imageFrames)) {
      console.log(`   [frames captured] ${req.body.imageFrames.length}`);
      console.log(`   [frame timestamps] ${JSON.stringify(req.body.imageFrames.map(f=>f.timestamp).filter(t=>t!==undefined))}`);
    }
    if(req.body?.audioBase64) {
      console.log("[audio received]");
      console.log(JSON.stringify({
        mimeType:req.body.audioMimeType||"audio/webm",
        sizeKB:Math.round(req.body.audioBase64.length*0.75/1024),
      },null,2));
    }
    if(req.body?.imageUrl)    console.log(`   url: ${req.body.imageUrl.slice(0,80)}`);
    if(req.body?.mediaType)   console.log(`   mediaType: ${req.body.mediaType}`);
    if(req.body?.stylePreset) console.log(`   preset: ${req.body.stylePreset}`);
  }
  next();
});

app.get("/health",(_,res)=>res.json({
  status:"ok",version:"4.3.0",
  ai:process.env.GEMINI_API_KEY?"gemini":process.env.ANTHROPIC_API_KEY?"claude":"MISSING",
  model:process.env.GEMINI_MODEL||(process.env.GEMINI_API_KEY?"gemini-2.5-flash":"claude"),
}));

app.get("/presets",(_,res)=>res.json(listPresets()));

app.post("/prompt-feedback",(req,res)=>{
  try{
    ensureFeedbackDir();
    const entry=sanitizeFeedbackEntry(req.body||{});
    const file=`feedback-${Date.now()}-${Math.random().toString(36).slice(2,8)}.json`;
    fs.writeFileSync(path.join(FEEDBACK_DIR,file),JSON.stringify(entry,null,2),"utf8");
    console.log("[prompt feedback]");
    console.log(JSON.stringify({
      platform:entry.platform,
      rating:entry.rating,
      issue_tags:entry.issue_tags,
    },null,2));
    res.json({ok:true,file,entry});
  }catch(e){
    res.status(400).json({error:e.message});
  }
});

app.get("/prompt-feedback/analytics",(_,res)=>{
  res.json(analyzePromptFeedback());
});

app.post("/analyze-image",async(req,res)=>{
  const {imageUrl,imageBase64,imageFrames,mimeType,mediaType,stylePreset,audioBase64,audioMimeType}=req.body;
  console.log("[server audio check]",{
    hasAudioBase64:!!audioBase64,
    mimeType:audioMimeType,
  });
  if(!imageBase64&&!imageUrl&&(!Array.isArray(imageFrames)||!imageFrames.length)) {
    return res.status(400).json({error:"imageUrl, imageBase64, or imageFrames required"});
  }
  const resolvedType=mediaType||"image";
  const preset=stylePreset||"cinematic";
  const audioPayload={audioBase64,audioMimeType};
  try{
    const raw=Array.isArray(imageFrames)&&imageFrames.length
      ?await analyzeImageFramesBase64(imageFrames,resolvedType,preset,audioPayload)
      :imageBase64
        ?await analyzeImageBase64(imageBase64,mimeType||"image/jpeg",resolvedType,preset,audioPayload)
        :await analyzeImageUrl(imageUrl,preset);
    if(raw?.error) return res.status(422).json(raw);
    const result=generatePrompts(raw,resolvedType);
    console.log(`OK ${resolvedType} preset=${preset} model=${result.model}`);
    res.json(result);
  }catch(e){
    console.error("ERR:",e.message);
    res.status(500).json({error:e.message,debug:e.debug||null});
  }
});

app.listen(PORT,()=>{
  const ai=process.env.GEMINI_API_KEY?"Gemini (free)":process.env.ANTHROPIC_API_KEY?"Claude (paid)":"MISSING";
  const model=process.env.GEMINI_MODEL||(process.env.GEMINI_API_KEY?"gemini-2.5-flash":"");
  console.log("\n"+"=".repeat(55));
  console.log("  VibePrompt API v4.3 - Cinematic Motion Engine");
  console.log("=".repeat(55));
  console.log(`  URL:    http://localhost:${PORT}`);
  console.log(`  AI:     ${ai} ${model}`);
  console.log(`  Presets: cinematic, luxury, fashion, viral, documentary, cyberpunk, anime`);
  console.log("=".repeat(55)+"\n");
});
module.exports=app;
module.exports.analyzePromptFeedback=analyzePromptFeedback;
