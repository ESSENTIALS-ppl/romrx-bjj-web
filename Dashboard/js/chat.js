// ROMRxBJJ — ROMBot Chat (chat.js)
// Calls Supabase ai-chat edge function in guest mode (GAS-auth bridge)

const SUPABASE_URL = 'https://cqzvqzwwevnflinxgnpp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxenZxend3ZXZuZmxpbnhnbnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDk2MjQsImV4cCI6MjA5Mjg4NTYyNH0.XsY-Y2VFoPc3RiPQ8HZNlygeKK52GSB7hiy4ZCTXsP4';
const AI_CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;
const HISTORY_KEY = 'romrxbjj_chat_history';
const PREFS_KEY   = 'romrxbjj_chat_prefs';
const MAX_HISTORY = 10; // messages kept in localStorage per session

// ---- State ----
let session = null;
let guestContext = {};
let chatHistory = [];  // [{role, content}]
let isLoading = false;
let currentProvider = 'rombot';
let providerKey = '';

// ---- Boot ----
document.addEventListener('DOMContentLoaded', async () => {
  session = requireAuth();
  if (!session) return;

  document.getElementById('user-name').textContent = session.name?.split(' ')[0] || 'Athlete';
  loadPrefs();
  updateProviderChip();
  restoreHistory();
  await loadGuestContext();
  renderWelcome();
  document.getElementById('chat-input').focus();
});

// ---- Load profile from GAS cache (or fetch) ----
async function loadGuestContext() {
  try {
    // Run profile, techniques, protocol, and belt check in parallel
    const [profile, techData, protocol, beltData] = await Promise.all([
      apiGetProfile(session.email),
      apiGetTechniques(session.email),
      apiGetProtocol(session.email),
      apiCheckPromotion(session.email),
    ]);

    // Technique summary: profile.techniques has numeric counts {green, yellow, red}
    const ts = profile?.techniques || {};
    const techSummary = {
      green:  ts.green  || 0,
      yellow: ts.yellow || 0,
      red:    ts.red    || 0,
    };

    // Red techniques: techData.techniques is an array with 'Final Tier', 'ROM Evaluated', Code, Name
    const techArray = Array.isArray(techData)
      ? techData
      : (techData?.techniques || []);

    const redTechs = techArray
      .filter(t => (t['Final Tier'] || '').toUpperCase() === 'RED')
      .slice(0, 5)
      .map(t => ({
        name: t['Technique Name'] || t.Name || t.Code || '',
        belt: t.Belt || t.belt || 'white',
        limiting_joints: t['ROM Evaluated'] ? [t['ROM Evaluated']] : [],
      }));

    // Protocol: data.priorities[].joint + .exercises[].name/sets/reps
    const priorities = protocol?.priorities || [];
    const protocolItems = priorities.slice(0, 3).map(p => {
      const ex = (p.exercises || [])[0] || {};
      return {
        joint:    p.joint || '',
        exercise: ex.name || ex.exercise || '',
        sets:     ex.sets || '',
        reps:     ex.reps || '',
        cue:      ex.coachingCue || ex.cue || '',
      };
    }).filter(p => p.exercise);

    guestContext = {
      full_name:         profile?.name || session.name,
      belt:              beltData?.currentBelt || profile?.belt || 'white',
      rom_total:         'N/A',   // not exposed in GAS API — will be N/A until v2 migration
      rom_percentile:    'N/A',
      worst_joints:      [],
      technique_summary: techSummary,
      red_techniques:    redTechs,
      protocol:          protocolItems,
    };

    renderContextBar(guestContext);
  } catch (e) {
    console.warn('Could not load context from GAS:', e);
    guestContext = { full_name: session.name };
    renderContextBar(guestContext);
  }
}

// ---- Render context bar ----
function renderContextBar(ctx) {
  const ts = ctx.technique_summary || {};
  document.getElementById('ctx-belt').textContent = (ctx.belt || 'white').toUpperCase() + ' BELT';
  document.getElementById('ctx-green').textContent = ts.green ?? '–';
  document.getElementById('ctx-yellow').textContent = ts.yellow ?? '–';
  document.getElementById('ctx-red').textContent = ts.red ?? '–';
  document.getElementById('ctx-rom').textContent = ctx.rom_total ? `ROM ${ctx.rom_total}` : '';
  document.getElementById('context-bar').style.display = 'flex';
}

// ---- Welcome message ----
function renderWelcome() {
  if (chatHistory.length > 0) return; // existing session
  const belt = guestContext.belt || 'white';
  const name = (guestContext.full_name || session.name || 'Athlete').split(' ')[0];
  appendMessage('assistant', `Hey ${name} — I'm ROMBot. I can see your ${belt} belt profile, technique readiness, and protocol.\n\nAsk me anything:\n- "Why is my Triangle RED?"\n- "What do I need to unlock De La Riva?"\n- "Which exercises should I prioritize this week?"`);
}

// ---- Send message ----
async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  autoResize(input);
  appendMessage('user', msg);
  chatHistory.push({ role: 'user', content: msg });
  setLoading(true);

  try {
    const body = {
      message: msg,
      user_email: session.email,
      guest_context: guestContext,
      history: chatHistory.slice(-MAX_HISTORY),
      provider: currentProvider,
      provider_key: providerKey,
      sport: 'bjj',
    };

    const res = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    chatHistory.push({ role: 'assistant', content: data.reply });
    saveHistory();
    appendMessage('assistant', data.reply);

  } catch (err) {
    appendMessage('assistant', `Something went wrong: ${err.message}. Check your API key in Settings if using a custom provider.`);
  } finally {
    setLoading(false);
  }
}

// ---- DOM helpers ----
function appendMessage(role, content) {
  const list = document.getElementById('messages');

  // Remove welcome placeholder if present
  const placeholder = list.querySelector('.chat-placeholder');
  if (placeholder) placeholder.remove();

  const wrap = document.createElement('div');
  wrap.className = `msg-wrap msg-${role}`;

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble msg-bubble-${role}`;

  // Convert markdown-ish formatting
  bubble.innerHTML = formatMessage(content);

  wrap.appendChild(bubble);
  list.appendChild(wrap);
  list.scrollTop = list.scrollHeight;
}

function formatMessage(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}

function setLoading(state) {
  isLoading = state;
  const btn = document.getElementById('send-btn');
  const indicator = document.getElementById('typing-indicator');
  btn.disabled = state;
  btn.textContent = state ? '…' : 'Send';
  indicator.style.display = state ? 'flex' : 'none';
  if (state) {
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ---- Persistence ----
function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory.slice(-MAX_HISTORY))); } catch (_) {}
}

function restoreHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    chatHistory = parsed;
    parsed.forEach(m => appendMessage(m.role, m.content));
  } catch (_) {}
}

function clearChat() {
  chatHistory = [];
  localStorage.removeItem(HISTORY_KEY);
  document.getElementById('messages').innerHTML = '<div class="chat-placeholder">Chat cleared — ask me anything about your mobility and technique readiness.</div>';
  renderWelcome();
}

// ---- Provider / prefs ----
function loadPrefs() {
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    if (!saved) return;
    const p = JSON.parse(saved);
    currentProvider = p.provider || 'rombot';
    providerKey = p.key || '';
    const el = document.getElementById('provider-key-input');
    if (el) el.value = providerKey;
  } catch (_) {}
}

function savePrefs() {
  const sel = document.getElementById('provider-select').value;
  const key = document.getElementById('provider-key-input').value.trim();
  currentProvider = sel;
  providerKey = sel === 'rombot' ? '' : key;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ provider: currentProvider, key: providerKey })); } catch (_) {}
  updateProviderChip();
  closeSettings();
}

function updateProviderChip() {
  const labels = { rombot: 'ROMBot', openai: 'GPT-4o', anthropic: 'Claude', google: 'Gemini', perplexity: 'Perplexity' };
  document.getElementById('provider-chip').textContent = labels[currentProvider] || 'ROMBot';
}

function openSettings() {
  document.getElementById('settings-modal').style.display = 'flex';
  document.getElementById('provider-select').value = currentProvider;
  toggleKeyInput();
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function toggleKeyInput() {
  const sel = document.getElementById('provider-select').value;
  const wrap = document.getElementById('key-input-wrap');
  wrap.style.display = sel === 'rombot' ? 'none' : 'block';
}

// ---- Key events ----
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});
