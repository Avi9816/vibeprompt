// VibePrompt — Utilities
// File download, cleanup, and helper functions

'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

/**
 * Download a file from URL to local path
 * Handles redirects (Instagram CDN often redirects)
 */
function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const protocol = url.startsWith('https') ? https : http;

    const options = {
      // rejectUnauthorized:false fixes SSL cert errors on Windows with Instagram CDN
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
    };

    const req = protocol.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`[Utils] Redirect → ${res.headers.location.substring(0, 60)}...`);
        return downloadFile(res.headers.location, destPath, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(destPath);
          console.log(`[Utils] Downloaded ${(stats.size / 1024).toFixed(1)} KB to ${path.basename(destPath)}`);
          resolve(destPath);
        });
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Download timeout (30s)'));
    });
  });
}

/**
 * Recursively remove a temp directory
 */
function cleanup(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[Utils] Cleaned up ${path.basename(dirPath)}`);
    }
  } catch (err) {
    console.warn('[Utils] Cleanup warning:', err.message);
  }
}

/**
 * Ensure a directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

module.exports = { downloadFile, cleanup, ensureDir, formatBytes };
