// VibePrompt Content Script v4.3
// Style presets, cinematic UX, motion-aware prompts, local history
(function(){
"use strict";

const DEFAULT_API="http://localhost:3000";
let overlayEl=null, activebtn=null;
const log=(...a)=>console.log("[VibePrompt]",...a);

// - LOADING MESSAGES -
const LOADING_MSGS=[
  "Analyzing cinematic composition...",
  "Understanding motion dynamics...",
  "Detecting camera movement style...",
  "Extracting subject details...",
  "Generating cinematic prompts...",
  "Optimizing for Runway & Sora...",
  "Crafting temporal scene flow...",
  "Finalizing premium prompts...",
];

// - PAGE TYPE -
function pageType(){
  const u=location.href;
  if(u.includes("/reels/")||u.includes("/reel/")) return "reel";
  if(u.includes("/stories/")) return "story";
  if(u.includes("/p/")) return "post";
  return "feed";
}

// - MEDIA EXTRACTION -
function scoreImg(img){
  if(!img.src||!img.src.startsWith("http")) return -1;
  if(img.src.includes("avatar")||img.src.includes("profile_pic")) return -1;
  const w=img.naturalWidth||img.width||0, h=img.naturalHeight||img.height||0;
  if(w<150||h<150) return -1;
  let s=w*h;
  if(img.src.includes("cdninstagram")||img.src.includes("fbcdn")) s*=2;
  return s;
}

// - FRAME QUALITY CHECK -
// Returns 0-100 quality score by sampling JPEG byte variance
// Low variance = black/blank frame, high = real content
function scoreFrame(b64){
  try{
    const raw=atob(b64.slice(400,2000));
    let sum=0,sumSq=0,n=raw.length;
    for(let i=0;i<n;i++){const v=raw.charCodeAt(i);sum+=v;sumSq+=v*v;}
    const mean=sum/n;
    const variance=(sumSq/n)-(mean*mean);
    return Math.min(100,Math.round(variance/15));
  }catch{return 50;}
}

// - VIDEO CAPTURE -
// WHY canvas.toDataURL() fails on Instagram reels:
// Instagram <video> src is a cross-origin CDN URL (instagram.fbcdn.net).
// Chrome taints the canvas when cross-origin video is drawn into it,
// making toDataURL() throw SecurityError regardless of crossOrigin attribute.
// This is a browser security restriction that cannot be bypassed in a content script.
//
// STRATEGY (in priority order):
// 1. Try canvas capture with crossOrigin="anonymous" (works if CDN allows it - rarely)
// 2. Use video.poster (Instagram sets a poster thumbnail = valid same-image CDN URL)
// 3. Find the largest <img> near/overlaid on the video (Instagram renders a thumbnail img)
// 4. If all fail, return null - never fall through to sending a raw video CDN URL

function tryCanvasCapture(video){
  // Only attempt if video has progressed (skip poster/loading frame at t=0)
  if(!video||video.readyState<2) return null;
  if(video.currentTime<0.05&&video.paused){
    log("capture: skipping t=0 paused frame (poster/loading)");
    return null;
  }
  const w=video.videoWidth||video.clientWidth||640;
  const h=video.videoHeight||video.clientHeight||640;
  if(w<10||h<10) return null;

  try{
    const c=document.createElement("canvas");
    c.width=w; c.height=h;
    c.getContext("2d").drawImage(video,0,0,w,h);
    const url=c.toDataURL("image/jpeg",0.88);
    if(!url||url==="data:,"||url.length<5000) return null;
    const b64=url.split(",")[1];
    if(!b64||b64.length<3000) return null;
    const quality=scoreFrame(b64);
    if(quality<8){log("capture: canvas frame blank (quality="+quality+")");return null;}
    log("capture: canvas OK quality="+quality+" size="+Math.round(b64.length/1024)+"KB");
    return{base64:b64,mimeType:"image/jpeg",source:"canvas",quality,width:w,height:h};
  }catch(e){
    // SecurityError: Tainted canvases may not be exported
    // This is the expected failure for cross-origin Instagram video
    log("capture: canvas blocked - "+e.name+": "+e.message);
    return null;
  }
}

function wait(ms){
  return new Promise(res=>setTimeout(res,ms));
}

function seekVideo(video,time){
  return new Promise((res,rej)=>{
    if(!video||!Number.isFinite(video.duration)) return rej(new Error("video duration unavailable"));
    const target=Math.max(0,Math.min(time,Math.max(0,video.duration-0.05)));
    let done=false;
    const cleanup=()=>{
      video.removeEventListener("seeked",onSeeked);
      video.removeEventListener("error",onError);
      clearTimeout(timer);
    };
    const finish=()=>{
      if(done) return;
      done=true;
      cleanup();
      res(target);
    };
    const fail=()=>{
      if(done) return;
      done=true;
      cleanup();
      rej(new Error("seek failed"));
    };
    const onSeeked=()=>finish();
    const onError=()=>fail();
    const timer=setTimeout(fail,2500);
    video.addEventListener("seeked",onSeeked,{once:true});
    video.addEventListener("error",onError,{once:true});
    try{
      if(Math.abs(video.currentTime-target)<0.04) finish();
      else video.currentTime=target;
    }catch(e){
      fail();
    }
  });
}

async function captureReelFrames(video){
  const originalTime=video.currentTime||0;
  const wasPaused=video.paused;
  const frames=[];
  const duration=Number.isFinite(video.duration)?video.duration:null;
  const targets=[originalTime,originalTime+0.5,originalTime+1.0]
    .filter(t=>duration==null||t<duration);

  try{
    if(!wasPaused) video.pause();
    for(const target of targets){
      try{
        if(Math.abs((video.currentTime||0)-target)>0.04) await seekVideo(video,target);
        await wait(120);
        const frame=tryCanvasCapture(video);
        if(frame&&frame.base64){
          frames.push({...frame,timestamp:Number((video.currentTime||target).toFixed(2))});
        }
      }catch(e){
        log("capture: seek frame failed at "+target.toFixed(2)+"s - "+e.message);
      }
    }
  }finally{
    try{
      if(Number.isFinite(video.duration)) await seekVideo(video,originalTime);
    }catch{}
    if(!wasPaused) video.play().catch(()=>{});
  }

  log("[frames captured]",frames.length);
  log("[frame timestamps]",frames.map(f=>f.timestamp));
  return frames;
}

async function probeAudioAccess(video){
  if(!video) return;
  const src=video.currentSrc||video.src||"";
  console.log("[audio probe]",{
    currentSrc:video.currentSrc,
    src:video.src,
    duration:video.duration,
    muted:video.muted,
    hasCaptureStream:typeof video.captureStream==="function",
  });

  const probe={
    sourceType:src.startsWith("blob:")?"blob":src.startsWith("http")?"http":src?"other":"none",
    fetch:null,
    mediaRecorder:null,
    audioContext:null,
  };

  if(src){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),3000);
    try{
      const r=await fetch(src,{
        method:"GET",
        mode:"cors",
        credentials:"include",
        signal:controller.signal,
      });
      probe.fetch={
        ok:r.ok,
        status:r.status,
        type:r.type,
        contentType:r.headers.get("content-type"),
        contentLength:r.headers.get("content-length"),
      };
    }catch(e){
      probe.fetch={ok:false,error:e.name+": "+e.message};
    }finally{
      clearTimeout(timer);
    }
  }

  try{
    const stream=typeof video.captureStream==="function"?video.captureStream():null;
    const audioTracks=stream?stream.getAudioTracks():[];
    probe.mediaRecorder={
      available:typeof MediaRecorder==="function",
      captureStreamAvailable:Boolean(stream),
      audioTrackCount:audioTracks.length,
      canRecordAudio:typeof MediaRecorder==="function"&&audioTracks.length>0,
      supportsAudioWebm:typeof MediaRecorder==="function"&&MediaRecorder.isTypeSupported("audio/webm;codecs=opus"),
      supportsVideoWebm:typeof MediaRecorder==="function"&&MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus"),
    };
    stream?.getTracks?.().forEach(t=>t.stop?.());
  }catch(e){
    probe.mediaRecorder={available:typeof MediaRecorder==="function",error:e.name+": "+e.message};
  }

  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    const ctx=AC?new AC():null;
    const destination=ctx?.createMediaStreamDestination?ctx.createMediaStreamDestination():null;
    probe.audioContext={
      available:Boolean(AC),
      hasCreateMediaElementSource:Boolean(ctx?.createMediaElementSource),
      hasMediaStreamDestination:Boolean(destination?.stream),
      destinationAudioTrackCount:destination?.stream?.getAudioTracks?.().length||0,
    };
    ctx?.close?.();
  }catch(e){
    probe.audioContext={available:Boolean(window.AudioContext||window.webkitAudioContext),error:e.name+": "+e.message};
  }

  console.log("[audio probe details]",probe);
}

async function captureReelAudio(video){
  console.log("[audio capture start]");
  const started=video?.currentTime||0;
  const logResult=(data)=>console.log("[audio capture]",data);
  if(!video||typeof video.captureStream!=="function"){
    logResult({captureStream:false,audioTracks:0,mimeType:null,duration:0,sizeKB:0});
    console.log("[audio capture skipped]");
    return null;
  }

  let stream=null;
  try{
    stream=video.captureStream();
    const audioTracks=stream.getAudioTracks();
    console.log("[audio tracks]",audioTracks.length);
    if(!audioTracks.length){
      logResult({captureStream:true,audioTracks:0,mimeType:null,duration:0,sizeKB:0});
      stream.getTracks().forEach(t=>t.stop());
      console.log("[audio capture skipped]");
      return null;
    }

    const mimeType=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ?"audio/webm;codecs=opus"
      :"audio/webm";
    const recorder=new MediaRecorder(new MediaStream(audioTracks),{mimeType});
    const chunks=[];
    const startedAt=performance.now();
    return await new Promise(res=>{
      let done=false;
      const finish=()=>{
        if(done) return;
        done=true;
        clearTimeout(timer);
        video.removeEventListener("ended",finish);
        try{if(recorder.state!=="inactive") recorder.stop();}catch{}
      };
      const timer=setTimeout(finish,5000);
      recorder.ondataavailable=e=>{if(e.data&&e.data.size>0) chunks.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(chunks,{type:mimeType});
        const duration=Math.min(5,Math.max(0,(performance.now()-startedAt)/1000));
        const sizeKB=Math.round(blob.size/1024);
        logResult({
          captureStream:true,
          audioTracks:audioTracks.length,
          mimeType:blob.type||mimeType,
          duration:Number(duration.toFixed(2)),
          sizeKB,
        });
        if(!blob.size) {
          console.log("[audio capture skipped]");
          return res(null);
        }
        const fr=new FileReader();
        fr.onload=()=>res({
          mimeType:blob.type||mimeType,
          base64:String(fr.result).split(",")[1]||"",
          duration:Number(duration.toFixed(2)),
        });
        fr.onerror=()=>res(null);
        fr.readAsDataURL(blob);
      };
      video.addEventListener("ended",finish,{once:true});
      try{
        recorder.start();
        if(video.paused) video.play().catch(()=>{});
      }catch(e){
        clearTimeout(timer);
        video.removeEventListener("ended",finish);
        stream.getTracks().forEach(t=>t.stop());
        logResult({captureStream:true,audioTracks:audioTracks.length,mimeType,error:e.name+": "+e.message,duration:0,sizeKB:0});
        console.log("[audio capture skipped]");
        res(null);
      }
    });
  }catch(e){
    stream?.getTracks?.().forEach(t=>t.stop());
    logResult({captureStream:true,audioTracks:null,mimeType:null,error:e.name+": "+e.message,duration:0,sizeKB:0});
    console.log("[audio capture skipped]");
    return null;
  }finally{
    try{video.currentTime=started;}catch{}
  }
}

// Fetch an image URL through the browser and convert to base64
// Works for <img> and video.poster URLs because Instagram images
// (unlike videos) serve CORS headers to browser requests
async function fetchImgAsBase64(url){
  if(!url||!url.startsWith("http")) return null;
  try{
    const r=await fetch(url,{mode:"cors",credentials:"include"});
    if(!r.ok){log("capture: img fetch HTTP "+r.status+" for "+url.slice(0,60));return null;}
    const blob=await r.blob();
    return await new Promise((res,rej)=>{
      const fr=new FileReader();
      fr.onload=()=>{
        const b64=fr.result.split(",")[1];
        if(!b64||b64.length<1000){rej(new Error("too small"));return;}
        const quality=scoreFrame(b64);
        if(quality<8){rej(new Error("blank frame quality="+quality));return;}
        log("capture: img fetch OK size="+Math.round(b64.length/1024)+"KB quality="+quality);
        res({base64:b64,mimeType:blob.type||"image/jpeg",source:"fetch",quality});
      };
      fr.onerror=rej;
      fr.readAsDataURL(blob);
    });
  }catch(e){
    log("capture: img fetch failed - "+e.message);
    return null;
  }
}

// Draw an already-loaded <img> element onto canvas
// Works when the img element is already in the page (browser loaded it with cookies)
function imgElementToBase64(imgEl){
  if(!imgEl||imgEl.naturalWidth<50||imgEl.naturalHeight<50) return null;
  try{
    const c=document.createElement("canvas");
    c.width=imgEl.naturalWidth; c.height=imgEl.naturalHeight;
    c.getContext("2d").drawImage(imgEl,0,0);
    const url=c.toDataURL("image/jpeg",0.88);
    const b64=url.split(",")[1];
    if(!b64||b64.length<1000) return null;
    const quality=scoreFrame(b64);
    if(quality<8){log("capture: img element blank quality="+quality);return null;}
    log("capture: img element OK size="+Math.round(b64.length/1024)+"KB quality="+quality);
    return{base64:b64,mimeType:"image/jpeg",source:"img-element",quality,
      width:imgEl.naturalWidth,height:imgEl.naturalHeight};
  }catch(e){
    // SecurityError if img is also cross-origin tainted
    log("capture: img element blocked - "+e.name);
    return null;
  }
}

// Find the best thumbnail image overlaid on or near a video element
// Instagram renders a <img> thumbnail under/over the video player
function findVideoThumbnail(video){
  // Check video.poster first (most reliable - Instagram always sets this)
  if(video.poster&&video.poster.startsWith("http")){
    log("capture: found video.poster URL");
    return{posterUrl:video.poster};
  }

  // Search for large img elements near the video in the DOM
  const container=video.closest("div,article,section")||video.parentElement;
  if(!container) return null;
  const imgs=[...container.querySelectorAll("img")].filter(i=>{
    const s=scoreImg(i);
    return s>0&&i.naturalWidth>200&&i.naturalHeight>200;
  });
  if(imgs.length>0){
    // Pick largest
    imgs.sort((a,b)=>(b.naturalWidth*b.naturalHeight)-(a.naturalWidth*a.naturalHeight));
    log("capture: found thumbnail img "+imgs[0].naturalWidth+"x"+imgs[0].naturalHeight);
    return{imgElement:imgs[0]};
  }
  return null;
}

// Master video capture - tries all methods in order, logs each attempt
async function captureReel(video){
  log("capture: starting for video t="+video.currentTime.toFixed(2)+" paused="+video.paused+" readyState="+video.readyState);

  // Method 1: Direct canvas capture (works if video somehow allows it)
  const canvasResult=tryCanvasCapture(video);
  if(canvasResult) return canvasResult;

  // Method 2: Video poster image (thumbnail Instagram bakes in)
  const thumb=findVideoThumbnail(video);
  if(thumb){
    if(thumb.posterUrl){
      log("capture: trying poster URL");
      const r=await fetchImgAsBase64(thumb.posterUrl);
      if(r) return{...r,source:"poster"};
    }
    if(thumb.imgElement){
      log("capture: trying thumbnail img element canvas");
      const r=imgElementToBase64(thumb.imgElement);
      if(r) return{...r,source:"thumbnail-canvas"};
      // If canvas draw of img also fails (tainted), try fetching its src
      log("capture: trying thumbnail img src fetch");
      const r2=await fetchImgAsBase64(thumb.imgElement.src);
      if(r2) return{...r2,source:"thumbnail-fetch"};
    }
  }

  // Method 3: Scan ALL images in page for any large content image
  log("capture: scanning all page images as last resort");
  const allImgs=[...document.querySelectorAll("img")].filter(i=>scoreImg(i)>10000);
  allImgs.sort((a,b)=>(b.naturalWidth*b.naturalHeight)-(a.naturalWidth*a.naturalHeight));
  for(const img of allImgs.slice(0,3)){
    const r=imgElementToBase64(img);
    if(r) return{...r,source:"page-img-canvas"};
    const r2=await fetchImgAsBase64(img.src);
    if(r2) return{...r2,source:"page-img-fetch"};
  }

  log("capture: ALL methods failed - Instagram blocked frame extraction");
  return null;
}

async function extractVideo(scope){
  const videos=[...(scope||document).querySelectorAll("video")];
  if(!videos.length) return null;

  // Sort: prefer playing videos over paused, longer currentTime = more content loaded
  videos.sort((a,b)=>{
    const score=v=>(!v.paused&&v.currentTime>0.1?100:0)+(v.currentTime>0?50:0)+v.readyState;
    return score(b)-score(a);
  });

  for(const v of videos){
    const frame=await captureReel(v);
    if(frame) return{type:"video-frame",...frame,element:v};
  }

  // Explicitly fail - do NOT fall back to sending a raw CDN video URL
  // Raw CDN video URLs return 403 from both browser (CORS) and server
  return{type:"video-capture-failed"};
}

function extractImage(scope){
  const imgs=(scope||document).querySelectorAll("img");
  let best=null,bestScore=-1;
  for(const img of imgs){const s=scoreImg(img);if(s>bestScore){best=img;bestScore=s;}}
  return best?{type:"image",url:best.src,element:best}:null;
}

function extractCarousel(article){
  const allImgs=[...article.querySelectorAll("img")].filter(i=>scoreImg(i)>0);
  let best=null,bestDist=Infinity;
  for(const img of allImgs){
    const r=img.getBoundingClientRect();
    const d=Math.abs((r.left+r.right)/2-window.innerWidth/2);
    if(d<bestDist){bestDist=d;best=img;}
  }
  return best?{type:"image",url:best.src,element:best}:extractImage(article);
}

// extractMedia is now async because extractVideo does async fetch attempts
async function extractMedia(scope){
  const v=await extractVideo(scope);
  if(v&&v.type!=="video-capture-failed") return v;
  // Even if video capture failed, record that this is video content
  // so the analysis pipeline uses video prompts
  if(v&&v.type==="video-capture-failed") return v;
  const imgCount=scope?scope.querySelectorAll("img").length:0;
  if(imgCount>2) return extractCarousel(scope||document);
  return extractImage(scope);
}

// - BASE64 CONVERSION (image posts only) -
// For videos, use captureReel() instead - this function is for <img> elements only
async function toBase64(media){
  if(media.base64) return{base64:media.base64,mimeType:media.mimeType};
  if(!media.url||!media.url.startsWith("http")) return null;

  // Try browser fetch (works for Instagram images which allow CORS from browser)
  const fetched=await fetchImgAsBase64(media.url);
  if(fetched) return fetched;

  // Canvas fallback from already-loaded img element
  if(media.element&&media.element.tagName==="IMG"){
    const r=imgElementToBase64(media.element);
    if(r) return r;
  }
  return null;
}

// - BUTTON -
function mkBtn(media,classes){
  const btn=document.createElement("button");
  btn.className="vp-btn "+(classes||"");
  btn.dataset.vpInjected="1";
  btn.innerHTML='<span class="vp-bicon">&#10024;</span><span class="vp-blabel">Get Prompt</span>';
  btn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();handleClick(btn,media);});
  return btn;
}

function findBar(article){
  const secs=article.querySelectorAll("section");
  for(const s of secs){if(s.querySelectorAll("svg").length>=2) return s;}
  return null;
}

// - INJECTION -
function injectAll(){
  const type=pageType();
  log("inject type="+type);
  if(type==="story"||type==="reel"){
    if(!document.querySelector("[data-vp-injected]")){
      // Don't await here - inject a placeholder button immediately,
      // actual media extraction happens at click time (avoids blocking injection)
      const btn=mkBtn({type:"video-pending",mediaType:"video"},
        type==="story"?"vp-floating vp-story":"vp-floating");
      document.body.appendChild(btn);
    }
    return;
  }
  document.querySelectorAll("article").forEach(async(art,i)=>{
    if(art.querySelector("[data-vp-injected]")) return;
    const media=await extractMedia(art);
    if(!media) return;
    const btn=mkBtn(media,"vp-inline");
    const bar=findBar(art);
    if(bar) bar.appendChild(btn); else art.appendChild(btn);
    log(`article ${i} (${media.type})`);
  });
}

// - CLICK HANDLER -
async function handleClick(btn,media){
  // Get saved preset from storage
  const stored=await getStorage("vp_preset");
  const preset=stored||"cinematic";

  const isVideoMedia=["video","video-frame","reel","story"].includes(media.type)||
    !!document.querySelector("video");
  const mediaType=isVideoMedia?"video":"image";
  console.log("[media.type]", media.type);
  console.log("[media.base64 exists]", !!media.base64);
  console.log("[isVideoMedia]", isVideoMedia);

  // Animate button with rotating messages
  btn.disabled=true;
  activebtn=btn;
  let msgIdx=0;
  btn.innerHTML=`<span class="vp-spinner"></span><span class="vp-blabel">${LOADING_MSGS[0]}</span>`;
  const msgTimer=setInterval(()=>{
    msgIdx=(msgIdx+1)%LOADING_MSGS.length;
    const lbl=btn.querySelector(".vp-blabel");
    if(lbl) lbl.textContent=LOADING_MSGS[msgIdx];
  },1500);

  try{
    let b64data=null;
    let imageFrames=null;
    let capturedFrames=null;
    let audioCapture=null;

    if(isVideoMedia){
      // Capture at click time for reels/stories (fresh attempt when user actually wants it)
      log("click: capturing reel frame at click time");
      const videos=[...document.querySelectorAll("video")];
      videos.sort((a,b)=>{
        const score=v=>(!v.paused&&v.currentTime>0.1?100:0)+(v.currentTime>0?50:0)+v.readyState;
        return score(b)-score(a);
      });
      if(videos.length>0){
        await probeAudioAccess(videos[0]);
        audioCapture=await captureReelAudio(videos[0]);
        const frames=await captureReelFrames(videos[0]);
        capturedFrames=frames;
        if(frames.length>1){
          imageFrames=frames.map(f=>({
            base64:f.base64,
            mimeType:f.mimeType||"image/jpeg",
            timestamp:f.timestamp,
          }));
          b64data={base64:frames[0].base64,mimeType:frames[0].mimeType||"image/jpeg"};
          log("click: reel captured frames="+frames.length+" size0="+Math.round(frames[0].base64.length/1024)+"KB");
        } else {
          const frame=frames[0]||await captureReel(videos[0]);
          if(frame&&frame.base64){
            b64data={base64:frame.base64,mimeType:frame.mimeType||"image/jpeg"};
            log("click: reel captured method="+frame.source+" size="+Math.round(frame.base64.length/1024)+"KB");
          } else if(media.base64){
            b64data={base64:media.base64,mimeType:media.mimeType||"image/jpeg"};
            log("click: falling back to pre-captured video frame source="+media.source);
          } else {
            throw new Error("Instagram blocked frame extraction. Try: pause the reel at a clear frame, then click Get Prompt again.");
          }
        }
      } else if(media.base64){
        b64data={base64:media.base64,mimeType:media.mimeType||"image/jpeg"};
        log("click: no video element, falling back to pre-captured video frame source="+media.source);
      } else {
        throw new Error("No video element found on this page.");
      }
    } else if(media.base64){
      // Already captured (image posts via canvas/fetch)
      b64data={base64:media.base64,mimeType:media.mimeType};
      log("click: using pre-captured frame source="+media.source);
    } else {
      // Image post: try browser fetch then canvas fallback
      b64data=await toBase64(media);
    }

    if(!b64data){
      throw new Error("Could not capture image. Instagram may have blocked access - try refreshing the page.");
    }

    const apiBase=(await getStorage("apiBase"))||DEFAULT_API;
    const payload=imageFrames&&imageFrames.length>1
      ?{imageFrames,mediaType,stylePreset:preset}
      :{imageBase64:b64data.base64,mimeType:b64data.mimeType,mediaType,stylePreset:preset};
    if(audioCapture?.base64){
      payload.audioBase64=audioCapture.base64;
      payload.audioMimeType=audioCapture.mimeType||"audio/webm";
      console.log("[audio payload]",{
        mimeType:payload.audioMimeType,
        sizeKB:Math.round(audioCapture.base64.length*0.75/1024),
      });
    }
    console.log("[audio payload check]",{
      hasAudioBase64:!!payload.audioBase64,
      mimeType:payload.audioMimeType,
      sizeKB:payload.audioBase64 ? Math.round(payload.audioBase64.length*0.75/1024) : 0,
    });
    console.log("[frames captured]", capturedFrames?.length);
    console.log("[frame timestamps]", capturedFrames?.map(f=>f.timestamp));
    console.log("[payload keys]", Object.keys(payload));
    console.log("[using imageFrames]", !!payload.imageFrames);
    console.log("[using imageBase64]", !!payload.imageBase64);
    const res=await fetch(apiBase.replace(/\/$/,"")+"/analyze-image",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    if(!res.ok){const e=await res.json().catch(()=>({error:"HTTP "+res.status}));throw new Error(e.error||"HTTP "+res.status);}
    const data=await res.json();
    saveHistory(data, "instagram-media");
    showOverlay(data);
  }catch(e){
    log("error:",e.message);
    showError(e.message,media);
  }finally{
    clearInterval(msgTimer);
    btn.disabled=false;
    btn.innerHTML='<span class="vp-bicon">&#10024;</span><span class="vp-blabel">Get Prompt</span>';
  }
}

// - STORAGE HELPERS -
function getStorage(key){
  return new Promise(res=>{
    try{chrome.storage.local.get(key,r=>res(r[key]||null));}catch{res(null);}
  });
}
function setStorage(key,val){
  try{chrome.storage.local.set({[key]:val});}catch{}
}

async function saveHistory(data,url){
  try{
    const hist=await getStorage("promptHistory")||[];
    hist.unshift({
      id:Date.now(),
      url,
      preset:data.stylePreset||"cinematic",
      mediaType:data.mediaType||"image",
      primaryPrompt:data.prompts?.master_prompt||data.prompts?.primary||data.prompts?.runway||"",
      prompts:data.prompts,
      scene:data.scene,
      savedAt:new Date().toISOString(),
    });
    if(hist.length>30) hist.pop();
    setStorage("promptHistory",hist);
  }catch(e){log("history save failed:",e.message);}
}

// - ESCAPE HELPERS -
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

// - OVERLAY -
const GENERATION_STYLES={
  cinematic:{title:"Cinematic",description:"Film-like cinematic realism."},
  viral:{title:"Viral Reel",description:"Native TikTok/Instagram short-form energy."},
  luxury:{title:"Luxury",description:"Premium commercial aesthetic."},
  documentary:{title:"Documentary",description:"Natural observational realism."},
  fashion:{title:"Fashion Editorial",description:"Magazine-inspired fashion direction."},
  cyberpunk:{title:"Cyberpunk",description:"Stylized neon futuristic atmosphere."},
  anime:{title:"Anime",description:"Stylized anime-inspired visual direction."},
};
const PRESET_LABELS=Object.fromEntries(Object.entries(GENERATION_STYLES).map(([id,p])=>[id,p.title]));
const FEEDBACK_ISSUE_TAGS=[
  "wrong motion",
  "wrong dialogue",
  "wrong lighting",
  "wrong camera",
  "too generic",
  "too cinematic",
  "inaccurate environment",
  "inaccurate subject",
  "poor audio recreation",
];
const QUICK_BENCH_FAILURES=[
  "motion too static",
  "wrong vibe",
  "generic face",
  "wrong camera",
  "weak reel energy",
  "lighting mismatch",
  "poor motion continuity",
  "weak creator vibe",
  "too cinematic",
  "inaccurate movement",
  "inaccurate audio vibe",
  "other",
];

function presetButtons(currentPreset){
  return Object.entries(GENERATION_STYLES).map(([id,p])=>
    `<button class="vp-preset-btn${id===currentPreset?" vp-preset-active":""}" data-preset="${id}" data-preset-desc="${esc(p.description)}">
      <span class="vp-preset-title">${esc(p.title)}</span>
      <span class="vp-preset-desc">${esc(p.description)}</span>
    </button>`
  ).join("");
}

function buildOverlay(data){
  const {prompts={},scene={},factual={},debug={},model,analysisMode,
    styleTags=[],cameraSpec="",motionScore=30,
    sceneProgression="",cameraMotion="",environmentalMotion="",
    stylePreset="cinematic",mediaType}=data;
  const isVideoType=mediaType==="video";
  const activeStyle=GENERATION_STYLES[stylePreset]||GENERATION_STYLES.cinematic;
  const masterPrompt=isVideoType
    ? (prompts.master_prompt||prompts.veo||prompts.sora||prompts.runway||prompts.kling||prompts.pika||prompts.primary||"")
    : (prompts.primary||prompts.flux||prompts.midjourney||"");

  // Video tools first for video, image tools first for images
  const videoTools=[
    {id:"veo",   label:"Veo",        copyLabel:"Copy Veo Prompt",    icon:"&#127916;",text:prompts.veo},
    {id:"sora",  label:"Sora",       icon:"&#127916;",text:prompts.sora},
    {id:"runway",label:"Runway",     copyLabel:"Copy Runway Prompt", icon:"&#127916;",text:prompts.runway},
    {id:"kling", label:"Kling",      icon:"&#127916;",text:prompts.kling},
    {id:"pika",  label:"Pika",       icon:"&#127916;",text:prompts.pika},
  ];
  const imageTools=[
    {id:"flux",  label:"Flux",       icon:"&#128444;",text:prompts.flux},
    {id:"mj",    label:"Midjourney", icon:"&#128444;",text:prompts.midjourney},
    {id:"key",   label:"Keyframe",   icon:"&#128444;",text:prompts.keyframe},
  ];
  const platformTools=(isVideoType?videoTools:imageTools).filter(p=>p.text);
  const feedbackTools=[
    {id:"master",label:isVideoType?"Master":"Primary",text:masterPrompt},
    ...platformTools,
  ].filter(p=>p.text);
  const feedbackPlatformOptions=feedbackTools.map(p=>{
    const promptKey=p.id==="master"?"master_prompt":p.id;
    return `<option value="${esc(promptKey)}">${esc(p.label)}</option>`;
  }).join("");
  const feedbackTags=FEEDBACK_ISSUE_TAGS.map(tag=>
    `<button class="vp-feedback-tag" data-feedback-tag="${esc(tag)}" type="button">${esc(tag)}</button>`
  ).join("");
  const quickBenchmarkButton=isVideoType
    ? `<button class="vp-save-benchmark" id="vpSaveBenchmark" type="button">Save Benchmark</button>`
    : "";

  const platforms=platformTools.map(p=>`
    <details class="vp-platform-card">
      <summary class="vp-platform-summary">
        <span class="vp-pcard-name">${p.icon} ${esc(p.label)}</span>
        <button class="vp-cpybtn vp-platform-copy" data-ct="${esc(p.text)}" type="button">${esc(p.copyLabel||"Copy")}</button>
      </summary>
      <div class="vp-pcard-text">${esc(p.text)}</div>
    </details>`).join("");

  // Motion analysis section (video only)
  const motionSection=isVideoType?`
    <div class="vp-motion-section">
      <div class="vp-section-label">Motion Analysis</div>
      <div class="vp-motion-grid">
        <div class="vp-mstat">
          <span class="vp-mstat-lbl">Motion Score</span>
          <div class="vp-mbar"><div class="vp-mfill" style="width:${Math.min(100,motionScore||30)}%"></div></div>
          <span class="vp-mstat-val">${motionScore||30}</span>
        </div>
        ${cameraMotion?`<div class="vp-minfo"><span class="vp-minfo-lbl">Camera</span><span class="vp-minfo-val">${esc(cameraMotion)}</span></div>`:""}
        ${sceneProgression?`<div class="vp-minfo"><span class="vp-minfo-lbl">Progression</span><span class="vp-minfo-val">${esc(sceneProgression)}</span></div>`:""}
        ${environmentalMotion?`<div class="vp-minfo"><span class="vp-minfo-lbl">Environment</span><span class="vp-minfo-val">${esc(environmentalMotion)}</span></div>`:""}
        ${cameraSpec?`<div class="vp-minfo"><span class="vp-minfo-lbl">Lens Spec</span><span class="vp-minfo-val">${esc(cameraSpec)}</span></div>`:""}
      </div>
    </div>`:
    cameraSpec?`<div class="vp-cam-info"><span class="vp-cam-lbl">Camera Spec</span><span class="vp-cam-val">${esc(cameraSpec)}</span></div>`:"";

  // Factual rows
  const factRows=Object.entries(factual).map(([k,v])=>`
    <div class="vp-fact-row">
      <span class="vp-fact-key">${esc(k.replace(/_/g," "))}</span>
      <span class="vp-fact-val">${esc(String(v||"-"))}</span>
    </div>`).join("");

  const dbgSteps=(debug.steps||[]).map(s=>`
    <div class="vp-dbg-step${s.error?" vp-dbg-err":""}">
      <span class="vp-dbg-stage">[${esc(s.stage)}]</span>
      <span class="vp-dbg-msg">${esc(s.msg||s.message||"")}</span>
      <span class="vp-dbg-ms">+${s.ms||s.elapsedMs||0}ms</span>
      ${s.error?`<div class="vp-dbg-errtext">${esc(s.error)}</div>`:""}
    </div>`).join("");

  return`<div class="vp-backdrop" id="vpBd">
<div class="vp-panel" id="vpPanel">

  <div class="vp-head">
    <div class="vp-head-left">
      <span class="vp-logo">&#10024;</span>
      <span class="vp-brand">VibePrompt</span>
      <span class="vp-preset-chip">${esc(activeStyle.title)}</span>
    </div>
    <button class="vp-x" id="vpX">&#10005;</button>
  </div>

  <div class="vp-scroll">

    <!-- GENERATION STYLE -->
    <div class="vp-presets-section">
      <div class="vp-section-label">Generation Style</div>
      <div class="vp-presets-row" id="vpPresets">${presetButtons(stylePreset)}</div>
      <div class="vp-preset-helper" id="vpPresetHelper">${esc(activeStyle.description)}</div>
    </div>

    <!-- MASTER PROMPT -->
    <div class="vp-master-section">
      <div class="vp-master-head">
        <div>
          <div class="vp-main-label">${isVideoType?"Master Prompt":"Generated Prompt"}</div>
          <div class="vp-master-desc">${isVideoType?"Optimized cross-platform cinematic video prompt.":"Primary image generation prompt."}</div>
        </div>
        <button class="vp-cpy-main" id="vpCpyMain">&#128203; ${isVideoType?"Copy Master Prompt":"Copy Prompt"}</button>
      </div>
      <div class="vp-main-prompt" id="vpMain">${esc(masterPrompt)}</div>
      <div class="vp-main-actions">
        <button class="vp-cpy-all" id="vpCpyAll">Copy All</button>
      </div>
    </div>

    <!-- PLATFORM PROMPTS -->
    <div class="vp-section-label vp-generated-label">Generated Prompts</div>
    <details class="vp-details">
      <summary class="vp-summary">Platform-Specific Prompts <span class="vp-badge">${platformTools.length}</span></summary>
      <div class="vp-details-body">${platforms}</div>
    </details>

    <!-- BENCHMARK TOOLS -->
    <details class="vp-details vp-benchmark-details">
      <summary class="vp-summary">Benchmark Tools</summary>
      <div class="vp-details-body">
        <div class="vp-benchmark-actions">${quickBenchmarkButton}</div>
        <div class="vp-feedback-section">
          <div class="vp-section-label">Rate Prompt Quality</div>
          <div class="vp-feedback-row">
            <select class="vp-feedback-select" id="vpFeedbackPlatform">${feedbackPlatformOptions}</select>
            <div class="vp-rating-row">
              ${[1,2,3,4,5].map(n=>`<button class="vp-rating-btn" data-rating="${n}" type="button">&#9733; ${n}</button>`).join("")}
            </div>
          </div>
          <div class="vp-feedback-tags">${feedbackTags}</div>
          <div class="vp-feedback-status" id="vpFeedbackStatus">Optional: pick issue tags before rating.</div>
        </div>
      </div>
    </details>

    <!-- ADVANCED DEBUG -->
    <details class="vp-details">
      <summary class="vp-summary">Advanced Debug Info <span class="vp-badge vp-amber">${esc(model||"")}</span></summary>
      <div class="vp-details-body">
        ${motionSection}
        <details class="vp-inner-details">
          <summary class="vp-inner-summary">Video Direction Metadata</summary>
          <div class="vp-fact-grid">${factRows}</div>
        </details>
        <details class="vp-inner-details">
          <summary class="vp-inner-summary">JSON Export</summary>
          <button class="vp-json-btn" id="vpDl">&#11015; Download JSON</button>
        </details>
        ${data.negative?`<details class="vp-inner-details">
          <summary class="vp-inner-summary">Negative Prompt</summary>
          <div class="vp-neg-box">
            <div class="vp-neg-text" id="vpNeg">${esc(data.negative||"")}</div>
            <button class="vp-cpybtn" data-copy="vpNeg">Copy</button>
          </div>
        </details>`:""}
        <div class="vp-dbg-meta">
          <span>Model: <b>${esc(model||"?")}</b></span>
          <span>Mode: <b>${esc(analysisMode||"?")}</b></span>
          <span>Time: <b>${debug.totalMs||0}ms</b></span>
        </div>
        <div class="vp-dbg-steps">${dbgSteps}</div>
      </div>
    </details>

  </div>

  <div class="vp-foot">
    <button class="vp-foot-btn vp-foot-pri" id="vpCpyMain2">&#128203; ${isVideoType?"Copy Master Prompt":"Copy Prompt"}</button>
  </div>

</div>
</div>`;
}

function feedbackConfidenceScores(factual={}){
  return {
    product_identity:Number(factual.confidence_product_identity||0),
    reel_type:Number(factual.confidence_reel_type||0),
    semantic_scene:Number(factual.confidence_semantic_scene||0),
    speech:Number(factual.confidence_speech||0),
    workflow_domain:Number(factual.confidence_workflow_domain||0),
  };
}

function quickBenchmarkCategory(factual={}){
  const text=[
    factual.reel_type,
    factual.content_type,
    factual.creator_archetype,
    factual.reel_energy,
    factual.scene_purpose,
    factual.activity_context,
    factual.content_theme,
    factual.primary_object,
    factual.product_identity,
  ].filter(Boolean).join(" ").toLowerCase();
  if(/\b(beauty|makeup|skincare|hair|fashion_portrait|beauty_portrait)\b/.test(text)) return "beauty";
  if(/\b(dance|music[_\s-]?performance|rhythmic|beat|choreography)\b/.test(text)) return "dance";
  if(/\b(food|recipe|cooking|ingredient|bread|meal|drink|coffee)\b/.test(text)) return "food";
  if(/\b(product|unboxing|showcase|review|packaging|brand)\b/.test(text)) return "product";
  if(/\b(talking[_\s-]?head|educational|motivational|tutorial|presenter|explaining)\b/.test(text)) return "talking_head";
  if(/\b(sport|fitness|gym|athletic|workout)\b/.test(text)) return "sports";
  if(/\b(travel|landscape|destination|street|hotel|nature_scene)\b/.test(text)) return "travel";
  return "talking_head";
}

function quickBenchmarkMotionEnergy(factual={}){
  return [
    factual.dance_energy,
    factual.movement_density,
    factual.motion_rhythm,
    factual.body_motion_style,
    factual.performance_intensity,
    factual.reel_energy,
    factual.motion_style,
    factual.subject_motion,
  ].filter(Boolean).join("; ");
}

function quickBenchmarkPayload(data,rating,mainFailure,notes){
  const prompts=data.prompts||{};
  const factual=data.factual||{};
  return {
    category:quickBenchmarkCategory(factual),
    master_prompt:prompts.master_prompt||"",
    veo_prompt:prompts.veo||"",
    reel_type:factual.reel_type||"other",
    creator_archetype:factual.creator_archetype||"",
    motion_energy:quickBenchmarkMotionEnergy(factual),
    rating,
    main_failure:mainFailure||"other",
    notes:notes||"",
  };
}

function showQuickBenchmarkModal(data,root){
  root.querySelector(".vp-quick-modal")?.remove();
  const failures=QUICK_BENCH_FAILURES.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join("");
  const modal=document.createElement("div");
  modal.className="vp-quick-modal";
  modal.innerHTML=`
    <div class="vp-quick-card">
      <div class="vp-quick-head">
        <span>Save Benchmark</span>
        <button class="vp-quick-x" type="button">&#10005;</button>
      </div>
      <div class="vp-quick-body">
        <div class="vp-quick-label">Rating</div>
        <div class="vp-quick-rating">
          <button data-qb-rating="bad" type="button">&#9733; Bad</button>
          <button data-qb-rating="okay" type="button">&#9733;&#9733; Okay</button>
          <button data-qb-rating="good" type="button">&#9733;&#9733;&#9733; Good</button>
        </div>
        <div class="vp-quick-label">Main failure</div>
        <select class="vp-quick-select" id="vpQuickFailure">${failures}</select>
        <div class="vp-quick-label">Optional notes</div>
        <textarea class="vp-quick-notes" id="vpQuickNotes" maxlength="500" placeholder="Short note..."></textarea>
        <div class="vp-quick-status" id="vpQuickStatus">Choose a rating to save.</div>
      </div>
    </div>`;
  root.appendChild(modal);
  modal.querySelector(".vp-quick-x")?.addEventListener("click",()=>modal.remove());
  modal.addEventListener("click",e=>{if(e.target===modal) modal.remove();});
  modal.querySelectorAll("[data-qb-rating]").forEach(btn=>{
    btn.addEventListener("click",()=>submitQuickBenchmark(data,root,modal,btn.dataset.qbRating));
  });
}

async function submitQuickBenchmark(data,root,modal,rating){
  const status=modal.querySelector("#vpQuickStatus");
  const failure=modal.querySelector("#vpQuickFailure")?.value||"other";
  const notes=modal.querySelector("#vpQuickNotes")?.value||"";
  const payload=quickBenchmarkPayload(data,rating,failure,notes);
  try{
    if(status){
      status.textContent="Saving benchmark...";
      status.className="vp-quick-status";
    }
    const apiBase=(await getStorage("apiBase"))||DEFAULT_API;
    const res=await fetch(apiBase.replace(/\/$/,"")+"/quick-benchmark",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
    });
    if(!res.ok){
      const err=await res.json().catch(()=>({error:"HTTP "+res.status}));
      throw new Error(err.error||"HTTP "+res.status);
    }
    console.log("[quick benchmark]",{
      category:payload.category,
      rating:payload.rating,
      main_failure:payload.main_failure,
    });
    if(status){
      status.textContent="Benchmark saved.";
      status.className="vp-quick-status vp-feedback-ok";
    }
    setTimeout(()=>modal.remove(),650);
  }catch(e){
    if(status){
      status.textContent="Save failed: "+e.message;
      status.className="vp-quick-status vp-feedback-err";
    }
  }
}

async function submitPromptFeedback(data,root,rating){
  const status=root.querySelector("#vpFeedbackStatus");
  const select=root.querySelector("#vpFeedbackPlatform");
  const promptKey=select?.value||"master_prompt";
  const prompts=data.prompts||{};
  const factual=data.factual||{};
  const prompt=prompts[promptKey]||prompts.master_prompt||prompts.primary||"";
  const issue_tags=[...root.querySelectorAll(".vp-feedback-tag-active")]
    .map(btn=>btn.dataset.feedbackTag)
    .filter(Boolean);
  const payload={
    platform:promptKey==="master_prompt"?"master":promptKey,
    reel_type:factual.reel_type||"other",
    prompt,
    master_prompt:prompts.master_prompt||"",
    rating,
    issue_tags,
    audio_type:factual.audio_type||"none",
    speech_language:factual.speech_language||"",
    confidence_scores:feedbackConfidenceScores(factual),
  };
  try{
    if(status) {
      status.textContent="Saving feedback...";
      status.className="vp-feedback-status";
    }
    const apiBase=(await getStorage("apiBase"))||DEFAULT_API;
    const res=await fetch(apiBase.replace(/\/$/,"")+"/prompt-feedback",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
    });
    if(!res.ok){
      const err=await res.json().catch(()=>({error:"HTTP "+res.status}));
      throw new Error(err.error||"HTTP "+res.status);
    }
    console.log("[prompt feedback]",{
      platform:payload.platform,
      rating:payload.rating,
      issue_tags:payload.issue_tags,
    });
    if(status) {
      status.textContent="Feedback saved. Thank you.";
      status.className="vp-feedback-status vp-feedback-ok";
    }
  }catch(e){
    if(status) {
      status.textContent="Feedback failed: "+e.message;
      status.className="vp-feedback-status vp-feedback-err";
    }
  }
}

function showOverlay(data){
  closeOverlay();
  const root=document.createElement("div");
  root.id="vp-root";
  root.innerHTML=buildOverlay(data);
  document.body.appendChild(root);
  overlayEl=root;
  requestAnimationFrame(()=>document.getElementById("vpPanel")?.classList.add("vp-panel-in"));

  document.getElementById("vpX")?.addEventListener("click",closeOverlay);
  document.getElementById("vpBd")?.addEventListener("click",e=>{if(e.target.id==="vpBd")closeOverlay();});
  document.addEventListener("keydown",function k(e){if(e.key==="Escape"){closeOverlay();document.removeEventListener("keydown",k);}});

  const isVideoType=data.mediaType==="video";
  const mainText=isVideoType
    ? (data.prompts?.master_prompt||data.prompts?.veo||data.prompts?.sora||data.prompts?.runway||data.prompts?.kling||data.prompts?.pika||data.prompts?.primary||"")
    : (data.prompts?.primary||data.prompts?.flux||data.prompts?.midjourney||"");
  const copyMain=()=>copyText(mainText,document.getElementById("vpCpyMain"));
  document.getElementById("vpCpyMain")?.addEventListener("click",copyMain);
  document.getElementById("vpCpyMain2")?.addEventListener("click",copyMain);
  document.getElementById("vpSaveBenchmark")?.addEventListener("click",()=>showQuickBenchmarkModal(data,root));

  document.getElementById("vpCpyAll")?.addEventListener("click",()=>{
    const p=data.prompts||{};
    const all=Object.entries(p).filter(([k,v])=>v&&k!=="primary").map(([k,v])=>`=== ${k.toUpperCase()} ===\n${v}`).join("\n\n");
    copyText(all,document.getElementById("vpCpyAll"));
  });

  root.querySelectorAll("[data-ct]").forEach(btn=>btn.addEventListener("click",e=>{
    e.stopPropagation();
    copyText(btn.dataset.ct,btn);
  }));
  root.querySelectorAll("[data-copy]").forEach(btn=>btn.addEventListener("click",()=>{
    const el=document.getElementById(btn.dataset.copy);
    if(el) copyText(el.textContent,btn);
  }));
  root.querySelectorAll(".vp-feedback-tag").forEach(btn=>{
    btn.addEventListener("click",()=>{
      btn.classList.toggle("vp-feedback-tag-active");
    });
  });
  root.querySelectorAll(".vp-rating-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      root.querySelectorAll(".vp-rating-btn").forEach(b=>b.classList.toggle("vp-rating-active",b===btn));
      submitPromptFeedback(data,root,Number(btn.dataset.rating)||0);
    });
  });

  document.getElementById("vpDl")?.addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:"vibeprompt-"+Date.now()+".json"}).click();
  });

  // Preset buttons - save selection and re-analyze
  root.querySelectorAll(".vp-preset-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const preset=btn.dataset.preset;
      setStorage("vp_preset",preset);
      // Update active state
      root.querySelectorAll(".vp-preset-btn").forEach(b=>b.classList.toggle("vp-preset-active",b.dataset.preset===preset));
      const helper=root.querySelector("#vpPresetHelper");
      if(helper) helper.textContent=btn.dataset.presetDesc||"";
      // Trigger re-analysis with new preset
      closeOverlay();
      if(activebtn) activebtn.click();
    });
  });
}

function showError(msg,media){
  closeOverlay();
  const root=document.createElement("div");
  root.id="vp-root";
  root.innerHTML=`<div class="vp-backdrop" id="vpBd">
<div class="vp-panel vp-err-panel" id="vpPanel">
  <div class="vp-head">
    <div class="vp-head-left"><span class="vp-logo">&#10024;</span><span class="vp-brand">VibePrompt</span></div>
    <button class="vp-x" id="vpX">&#10005;</button>
  </div>
  <div class="vp-err-body">
    <div class="vp-err-icon">&#9888;&#65039;</div>
    <div class="vp-err-title">Analysis Failed</div>
    <div class="vp-err-msg">${esc(msg)}</div>
    <div class="vp-err-hint">${esc(msg).includes("black") || esc(msg).includes("blank") || esc(msg).includes("Frame") ? "Try: pause the reel at a good frame, then retry." : "Make sure the backend is running: node server.js"}</div>
    <button class="vp-retry" id="vpRetry">&#128260; Retry</button>
  </div>
</div></div>`;
  document.body.appendChild(root);
  overlayEl=root;
  requestAnimationFrame(()=>document.getElementById("vpPanel")?.classList.add("vp-panel-in"));
  document.getElementById("vpX")?.addEventListener("click",closeOverlay);
  document.getElementById("vpBd")?.addEventListener("click",e=>{if(e.target.id==="vpBd")closeOverlay();});
  document.getElementById("vpRetry")?.addEventListener("click",()=>{closeOverlay();if(activebtn)activebtn.click();});
}

function closeOverlay(){overlayEl?.remove();overlayEl=null;}

function copyText(text,btn){
  navigator.clipboard.writeText(text).then(()=>{
    if(!btn) return;
    const orig=btn.textContent;
    btn.textContent="Copied!";btn.classList.add("vp-copied");
    setTimeout(()=>{btn.textContent=orig;btn.classList.remove("vp-copied");},2000);
  }).catch(()=>{
    const ta=Object.assign(document.createElement("textarea"),{value:text});
    document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();
  });
}

// - OBSERVER -
let injectTimer;
function scheduleInject(d){clearTimeout(injectTimer);injectTimer=setTimeout(injectAll,d||700);}
new MutationObserver(()=>scheduleInject(500)).observe(document.body,{childList:true,subtree:true});
let lastUrl=location.href;
new MutationObserver(()=>{
  if(location.href!==lastUrl){lastUrl=location.href;log("URL->",lastUrl);scheduleInject(1500);}
}).observe(document.head,{childList:true,subtree:true,characterData:true});
scheduleInject(2000);
log("v4.3 loaded");
})();
