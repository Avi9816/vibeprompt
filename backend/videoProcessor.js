// VibePrompt — Video Processor
// Uses ffmpeg to extract frames from downloaded Instagram videos

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Extracts frames from a video file using ffmpeg.
 * @param {string} videoPath - Path to the downloaded video
 * @param {string} outputDir - Directory to write frame images
 * @param {object} opts - Options: { fps, maxFrames }
 * @returns {Promise<string[]>} - Array of frame file paths
 */
async function extractFrames(videoPath, outputDir, opts = {}) {
  const { fps = 1, maxFrames = 10 } = opts;
  const framesDir = path.join(outputDir, 'frames');

  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  // Check if ffmpeg is available
  const ffmpegAvailable = await checkFfmpeg();

  if (!ffmpegAvailable) {
    console.warn('[VideoProcessor] ffmpeg not found — using mock frames');
    return getMockFramePaths(framesDir, Math.min(maxFrames, 5));
  }

  // Get video duration first
  let duration = 10; // fallback
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);
    duration = parseFloat(stdout.trim()) || 10;
  } catch {
    console.warn('[VideoProcessor] ffprobe failed, using fallback duration');
  }

  // Calculate how many frames to actually capture
  const totalFrames = Math.min(Math.floor(duration * fps), maxFrames);
  const frameInterval = duration / totalFrames;

  console.log(`[VideoProcessor] Duration: ${duration}s, extracting ${totalFrames} frames every ${frameInterval.toFixed(1)}s`);

  const framePaths = [];

  // Extract frames at calculated intervals
  for (let i = 0; i < totalFrames; i++) {
    const timestamp = i * frameInterval;
    const framePath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.jpg`);

    try {
      await execFileAsync('ffmpeg', [
        '-ss', timestamp.toFixed(2),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',           // High quality JPEG
        '-vf', 'scale=640:-1', // Resize to 640px wide
        '-y',                  // Overwrite
        framePath,
      ]);

      if (fs.existsSync(framePath)) {
        framePaths.push(framePath);
      }
    } catch (err) {
      console.warn(`[VideoProcessor] Frame ${i} extraction failed:`, err.message);
    }
  }

  if (framePaths.length === 0) {
    console.warn('[VideoProcessor] No frames extracted, using mock');
    return getMockFramePaths(framesDir, 5);
  }

  console.log(`[VideoProcessor] ✓ Extracted ${framePaths.length} frames`);
  return framePaths;
}

async function checkFfmpeg() {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates placeholder frame paths for mock mode
 * (when ffmpeg is not installed)
 */
function getMockFramePaths(framesDir, count) {
  const paths = [];
  for (let i = 0; i < count; i++) {
    const p = path.join(framesDir, `mock_frame_${i}.jpg`);
    // Write a tiny placeholder file so downstream code doesn't break
    fs.writeFileSync(p, Buffer.from('MOCK_FRAME'));
    paths.push(p);
  }
  return paths;
}

module.exports = { extractFrames };
