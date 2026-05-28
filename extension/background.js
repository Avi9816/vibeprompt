// VibePrompt - Background Service Worker (Manifest V3)
// Handles extension lifecycle, icon badge updates, and tab state

const API_BASE = 'http://localhost:3000';

// - INSTALL & SETUP -
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VibePrompt] Extension installed');
  chrome.storage.local.set({ apiBase: API_BASE, promptHistory: [] });
});

// - MESSAGE HANDLER -
// Content scripts can send messages here for background tasks
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'ok', version: '1.0.0' });
    return true;
  }

  if (message.type === 'SAVE_PROMPT') {
    savePromptToHistory(message.data);
    sendResponse({ saved: true });
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    chrome.storage.local.get('promptHistory', (result) => {
      sendResponse(result.promptHistory || []);
    });
    return true; // async
  }

  if (message.type === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ promptHistory: [] });
    sendResponse({ cleared: true });
    return true;
  }

  if (message.type === 'SET_API_BASE') {
    chrome.storage.local.set({ apiBase: message.url });
    sendResponse({ set: true });
    return true;
  }
});

// - SAVE PROMPT HISTORY -
async function savePromptToHistory(data) {
  const result = await chrome.storage.local.get('promptHistory');
  const history = result.promptHistory || [];

  history.unshift({
    ...data,
    savedAt: new Date().toISOString(),
    id: Date.now(),
  });

  // Keep last 50 prompts
  if (history.length > 50) history.pop();

  await chrome.storage.local.set({ promptHistory: history });
  console.log('[VibePrompt] Prompt saved to history');
}

// - TAB LISTENER - update badge on Instagram tabs -
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('instagram.com')) {
    chrome.action.setBadgeText({ text: '-', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId });
  }
});

console.log('[VibePrompt] Background service worker started');
