// VibePrompt - Popup Script

const DEFAULT_API = 'http://localhost:3000';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function videoPromptButtons(prompts = {}, index) {
  const tools = [
    ['master_prompt', 'Copy Master Prompt'],
    ['veo', 'Copy Veo Prompt'],
    ['sora', 'Copy Sora Prompt'],
    ['runway', 'Copy Runway Prompt'],
    ['kling', 'Copy Kling Prompt'],
    ['pika', 'Copy Pika Prompt'],
  ];
  return tools
    .filter(([key]) => prompts[key])
    .map(([key, label]) => `<button class="history-copy" data-history-index="${index}" data-prompt-key="${key}">${label}</button>`)
    .join('');
}

async function copyPrompt(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove('copied');
    }, 1200);
  }
}

// - TABS -
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
  });
});

// - SERVER STATUS CHECK -
async function checkServerStatus() {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  const base = apiBase || DEFAULT_API;
  const dot = document.getElementById('statusDot');
  const info = document.getElementById('serverInfo');

  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className = 'status-dot online';
      info.textContent = 'Online -';
      info.className = 'server-info ok';
    } else {
      throw new Error('not ok');
    }
  } catch {
    dot.className = 'status-dot offline';
    info.textContent = 'Offline';
    info.className = 'server-info fail';
  }
}

// - HISTORY -
async function loadHistory() {
  const { promptHistory } = await chrome.storage.local.get('promptHistory');
  const list = document.getElementById('historyList');

  if (!promptHistory?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">-</div>
        <div>No prompts yet</div>
        <div class="empty-sub">Analyzed prompts will appear here</div>
      </div>`;
    return;
  }

  list.innerHTML = promptHistory.map((item, index) => {
    const preview = item.prompts?.master_prompt || item.prompts?.primary || item.primaryPrompt || item.prompts?.runway || item.prompts?.sora || item.prompts?.kling || item.prompts?.veo || item.prompts?.flux || item.prompts?.midjourney || item.prompts?.keyframe || item.prompts?.universal || '';
    const copyButtons = videoPromptButtons(item.prompts, index);
    return `
    <div class="history-item">
      <div class="history-type">${esc(item.mediaType || 'video')} - ${esc(item.scene?.style || 'Unknown style')}</div>
      ${copyButtons ? `<div class="history-copy-grid">${copyButtons}</div>` : ''}
      <div class="history-preview">${esc(preview.substring(0, 80) || 'No preview')}...</div>
      <div class="history-date">${new Date(item.savedAt).toLocaleDateString()} ${new Date(item.savedAt).toLocaleTimeString()}</div>
    </div>
  `;
  }).join('');

  list.querySelectorAll('[data-history-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = promptHistory[Number(btn.dataset.historyIndex)];
      const text = item?.prompts?.[btn.dataset.promptKey];
      copyPrompt(text, btn);
    });
  });
}

document.getElementById('clearHistory')?.addEventListener('click', async () => {
  await chrome.storage.local.set({ promptHistory: [] });
  loadHistory();
});

// - SETTINGS -
async function loadSettings() {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  const input = document.getElementById('apiUrl');
  if (input) input.value = apiBase || DEFAULT_API;
}

document.getElementById('saveApi')?.addEventListener('click', async () => {
  const url = document.getElementById('apiUrl').value.trim();
  if (url) {
    await chrome.storage.local.set({ apiBase: url });
    const btn = document.getElementById('saveApi');
    btn.textContent = '- Saved';
    setTimeout(() => { btn.textContent = 'Save'; }, 2000);
    checkServerStatus();
  }
});

document.getElementById('testConnection')?.addEventListener('click', async () => {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  const base = apiBase || DEFAULT_API;
  const resultEl = document.getElementById('testResult');
  resultEl.style.display = 'block';
  resultEl.textContent = 'Testing...';
  resultEl.className = 'test-result';

  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    resultEl.className = 'test-result success';
    resultEl.textContent = `- Connected! Server v${data.version || '?'} online`;
  } catch (err) {
    resultEl.className = 'test-result error';
    resultEl.textContent = `- Failed: ${err.message}. Is server running?`;
  }
});

// - INIT -
checkServerStatus();
loadHistory();
loadSettings();

// Refresh history when switching to its tab
document.querySelector('[data-tab="history"]')?.addEventListener('click', loadHistory);
