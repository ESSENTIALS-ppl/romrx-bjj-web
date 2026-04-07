// ROMRxBJJ Coach Dashboard API Client
// Same caching pattern as athlete api.js

const COACH_API_URL = 'https://script.google.com/macros/s/AKfycbyyeMmDsIECs1mRQVaoDX-sAWAvbgIB2e5suY-rSWzqif4PZJgNFYCk9XOhYbcE4wm6Lw/exec';
const COACH_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function coachCacheGet(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (Date.now() - cached.ts > COACH_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return cached.data;
  } catch(e) { return null; }
}

function coachCacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data }));
  } catch(e) {}
}

async function coachApiCall(params) {
  var url = new URL(COACH_API_URL);
  for (var k in params) {
    url.searchParams.set(k, params[k]);
  }
  var resp = await fetch(url.toString(), { redirect: 'follow' });
  if (!resp.ok) throw new Error('API request failed: ' + resp.status);
  return await resp.json();
}

async function apiCoachLogin(email, code) {
  return await coachApiCall({ action: 'coachLogin', email: email, code: code });
}

async function apiGetRoster(coachEmail) {
  var cacheKey = 'romrxbjj_coach_roster';
  var cached = coachCacheGet(cacheKey);
  if (cached) return cached;
  var result = await coachApiCall({ action: 'coachRoster', coachEmail: coachEmail });
  if (result.success !== false) coachCacheSet(cacheKey, result);
  return result;
}

async function apiGetTechniqueList(coachEmail) {
  var cacheKey = 'romrxbjj_coach_techlist';
  var cached = coachCacheGet(cacheKey);
  if (cached) return cached;
  var result = await coachApiCall({ action: 'techniqueList', coachEmail: coachEmail });
  if (result.success !== false) coachCacheSet(cacheKey, result);
  return result;
}

async function apiGetClassWarmup(coachEmail, techniqueCode) {
  // No cache — coach picks different techniques rapidly
  var params = { action: 'classWarmup', coachEmail: coachEmail };
  if (techniqueCode) params.techniqueCode = techniqueCode;
  return await coachApiCall(params);
}

function clearCoachCache() {
  var keys = Object.keys(localStorage);
  keys.forEach(function(k) {
    if (k.startsWith('romrxbjj_coach_')) localStorage.removeItem(k);
  });
}

const TYPE_MAP = {
  'All': null,
  'Takedowns': 'T',
  'Guard Passes': 'P',
  'Guards': 'G',
  'Sweeps': 'S',
  'Controls': 'C',
  'Submissions': 'X'
};

let allTechniques = [];
let activeCategory = 'All';
let activeTechCode = null;

async function loadWarmupTab() {
  const container = document.getElementById('warmup-content');
  container.innerHTML = '<p class="loading-msg">Loading techniques...</p>';

const session = JSON.parse(sessionStorage.getItem('romrxbjj_coach') || '{}');
  const result = await apiGetTechniqueList(session.email);

  if (!result.success) {
    container.innerHTML = '<p class="error-msg">Could not load techniques: ' + (result.error || 'Unknown error') + '</p>';
    return;
  }

  allTechniques = result.techniques || [];
  renderWarmupUI(container);
}

function renderWarmupUI(container) {
  container.innerHTML = '';

  // --- Category Pills ---
  const pillBar = document.createElement('div');
  pillBar.className = 'category-pills';
  Object.keys(TYPE_MAP).forEach(label => {
    const pill = document.createElement('button');
    pill.className = 'cat-pill' + (label === activeCategory ? ' active' : '');
    pill.textContent = label;
    pill.onclick = () => {
      activeCategory = label;
      activeTechCode = null;
      renderWarmupUI(container);
    };
    pillBar.appendChild(pill);
  });
  container.appendChild(pillBar);

  // --- Technique Grid ---
  const typeFilter = TYPE_MAP[activeCategory];
  const filtered = typeFilter
    ? allTechniques.filter(t => t.type === typeFilter)
    : allTechniques;

  const grid = document.createElement('div');
  grid.className = 'technique-grid';

  // Belt separator logic
  let lastBelt = null;
  filtered.forEach(t => {
    if (t.belt !== lastBelt) {
       const sep = document.createElement('div');
      sep.className = 'belt-separator';
      sep.textContent = t.belt === 'W' ? 'White Belt' : 'Blue Belt';
      grid.appendChild(sep);
      lastBelt = t.belt;
    }
    const btn = document.createElement('button');
    btn.className = 'tech-btn' + (activeTechCode === t.code ? ' selected' : '');
    btn.innerHTML = '<span class="tech-code">' + t.code + '</span>';
    btn.title = t.name;
    btn.onclick = () => {
      activeTechCode = t.code;
      renderWarmupUI(container);
      loadRAMP(t.code);
    };
    grid.appendChild(btn);
  });

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = 'No techniques in this category.';
    grid.appendChild(empty);
  }
  container.appendChild(grid);

  // --- RAMP Display Area ---
  const rampArea = document.createElement('div');
  rampArea.id = 'ramp-display';
  if (!activeTechCode) {
    rampArea.innerHTML = '<div class="ramp-placeholder">'
      + '<div class="ramp-icon">&#x1F3CB;</div>'
      + '<p>Select a technique above to generate the RAMP warmup</p>'
      + '</div>';
  }
  container.appendChild(rampArea);
}

async function loadRAMP(code) {
  const rampArea = document.getElementById('ramp-display');
  rampArea.innerHTML = '<p class="loading-msg">Generating RAMP for ' + code + '...</p>';
const session = JSON.parse(sessionStorage.getItem('romrxbjj_coach') || '{}');
  const result = await apiGetClassWarmup(session.email, code);
  if (!result.success) {
    rampArea.innerHTML = '<p class="error-msg">' + (result.error || 'Failed to load warmup') + '</p>';
    return;
  }
  renderRAMP(rampArea, result);
}

function renderRAMP(container, data) {
  const phases = [
    { key: 'raise',      icon: '&#x1F525;', color: '#DC3545' },
    { key: 'activate',   icon: '&#x26A1;',  color: '#FFB347' },
    { key: 'mobilize',   icon: '&#x1F537;', color: '#008080' },
    { key: 'potentiate', icon: '&#x1F33F;', color: '#28A745' }
  ];

  let html = '<div class="ramp-header">'
    + '<h3>' + data.techniqueCode + ' — ' + data.techniqueName + '</h3>'
    + '<div class="ramp-meta">'
    + '<span class="ramp-belt">' + (data.belt === 'W' ? 'White Belt' : 'Blue Belt') + '</span>'
    + '<span class="ramp-joints">' + data.primaryJoints + '</span>'
    + '<span class="ramp-duration">' + data.totalDuration + ' total</span>'
    + '</div></div>';

  html += '<div class="ramp-cards">';
  phases.forEach(p => {
    const phase = data.rampPlan[p.key];
    if (!phase) return;
    const drills = phase.drills.split(';').map(d => d.trim()).filter(Boolean);
    html += '<div class="ramp-card" style="border-left: 4px solid ' + p.color + '">'
      + '<div class="ramp-card-header">'
      + '<span class="ramp-phase-icon">' + p.icon + '</span>'
      + '<span class="ramp-phase-label">' + phase.label + '</span>'
      + '<span class="ramp-phase-dur">' + phase.duration + '</span>'
      + '</div>'
      + '<p class="ramp-purpose">' + phase.purpose + '</p>'
      + '<ul class="ramp-drills">';
    drills.forEach(d => { html += '<li>' + d + '</li>'; });
    html += '</ul></div>';
  });
  html += '</div>';

  container.innerHTML = html;
}
