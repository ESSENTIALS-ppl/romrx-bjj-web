// ROMRxBJJ Coach Dashboard Auth
// Same session pattern as athlete auth.js but checks for coach flag

function getCoachSession() {
  try {
    var raw = sessionStorage.getItem('romrxbjj_coach');
    if (!raw) return null;
    var session = JSON.parse(raw);
    // Session expires after 8 hours
    if (Date.now() - session.loginTime > 8 * 60 * 60 * 1000) {
      clearCoachSession();
      return null;
    }
    return session;
  } catch(e) {
    return null;
  }
}

function requireCoachAuth() {
  var session = getCoachSession();
  if (!session) {
    window.location.href = '/coach/';
    return null;
  }
  return session;
}

function clearCoachSession() {
  sessionStorage.removeItem('romrxbjj_coach');
  clearCoachCache();
}

function coachLogout() {
  clearCoachSession();
  window.location.href = '/coach/';
}