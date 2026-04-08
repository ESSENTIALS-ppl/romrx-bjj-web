// ROMRxBJJ Dashboard API Client — v2 (Optimized)
const API_BASE = ROMRX_API_URL; // defined in config.js — do not hardcode here


// ========================================
// CORE API CALL (timeout + error handling)
// ========================================
async function apiCall(params) {
  const url = API_BASE + '?' + new URLSearchParams(params);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timeout. Please try again.' };
    }
    return { success: false, error: 'Network error. Please try again.' };
  }
}


// ========================================
// API ENDPOINTS
// ========================================

// Login
async function apiLogin(email, code) {
  return await apiCall({ action: 'login', email: email, code: code });
}

// Get profile with 24-hour cache
async function apiGetProfile(email) {
  const cacheKey = 'romrxbjj_cache_profile';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await apiCall({ action: 'profile', email: email });
  if (result.success !== false) {
    setCached(cacheKey, result);
  }
  return result;
}

// Get techniques with 24-hour cache
async function apiGetTechniques(email) {
  const cacheKey = 'romrxbjj_cache_techniques';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await apiCall({ action: 'techniques', email: email });
  if (result.success !== false) {
    setCached(cacheKey, result);
  }
  return result;
}

// Get exercises with 24-hour cache
async function apiGetExercises(email) {
  const cacheKey = 'romrxbjj_cache_exercises';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await apiCall({ action: 'exercises', email: email });
  if (result.success !== false) {
    setCached(cacheKey, result);
  }
  return result;
}

// Get protocol with 24-hour cache
async function apiGetProtocol(email) {
  const cacheKey = 'romrxbjj_cache_protocol';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await apiCall({ action: 'protocol', email: email });
  if (result.success !== false) {
    setCached(cacheKey, result);
  }
  return result;
}

// Get flow graph with 24-hour cache (no email needed)
async function apiGetFlowGraph() {
  const cacheKey = 'romrxbjj_cache_flow_graph';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await apiCall({ action: 'flow_graph' });
  if (result.success !== false) {
    setCached(cacheKey, result);
  }
  return result;
}

// Get progress history with 24-hour cache
async function apiGetProgress(email) {
  const cacheKey = 'romrxbjj_cache_progress';
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const result = await apiCall({ action: 'progress', email: email });
  if (result.success !== false) setCached(cacheKey, result);
  return result;
}

// Belt Promotion API — FIX: now uses apiCall() for timeout + error handling
async function apiCheckPromotion(email) {
  return await apiCall({ action: 'checkPromotion', email: email });
}

async function apiRequestPromotion(email) {
  return await apiCall({ action: 'requestPromotion', email: email });
}


// ========================================
// CACHE HELPERS
// ========================================

function getCached(key) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const data = JSON.parse(item);
    const age = Date.now() - data.cachedAt;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (age < maxAge) {
      return data.data;
    } else {
      localStorage.removeItem(key);
      return null;
    }
  } catch (e) {
    return null;
  }
}

function setCached(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({
      data: data,
      cachedAt: Date.now()
    }));
  } catch (e) {
    console.warn('Cache storage failed:', e);
  }
}

// Clear all cached API data (keeps session alive)
// Use this for a future "Refresh My Data" button
function clearCache() {
  var keys = Object.keys(localStorage);
  keys.forEach(function(key) {
    if (key.startsWith('romrxbjj_cache_')) {
      localStorage.removeItem(key);
    }
  });
}


// ========================================
// SESSION MANAGEMENT
// ========================================

function getSession() {
  try {
    const sessionStr = localStorage.getItem('romrxbjj_session');
    if (!sessionStr) return null;

    const session = JSON.parse(sessionStr);
    const age = Date.now() - session.loginTime;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (age < maxAge) {
      return session;
    } else {
      clearSession();
      return null;
    }
  } catch (e) {
    return null;
  }
}

// Added 'code' parameter so subscribe.html polling can re-authenticate
function saveSession(email, name, subscriptionStatus, subscriptionExpiry, code) {
  try {
    localStorage.setItem('romrxbjj_session', JSON.stringify({
      email: email,
      name: name,
      subscriptionStatus: subscriptionStatus || '',
      subscriptionExpiry: subscriptionExpiry || '',
      code: code || '',
      loginTime: Date.now()
    }));
  } catch (e) {
    console.error('Failed to save session:', e);
  }
}

function clearSession() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('romrxbjj_')) {
      localStorage.removeItem(key);
    }
  });
  window.location.href = 'index.html';
}

function requireAuth() {
  const session = getSession();
  if (!session) {
    clearSession();
    return null;
  }
  return session;
}

// Subscription gate — call after requireAuth() on every dashboard page
function checkSubscription() {
  const session = getSession();
  if (!session) return false;
  const status = session.subscriptionStatus;
  if (status === 'trial' || status === 'active' || status === 'trialing') {
    return true;
  }
  window.location.href = 'subscribe.html';
  return false;
}