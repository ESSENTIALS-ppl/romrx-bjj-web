// ROMRxBJJ — GA4 Analytics Helper — #36 Sprint 5
// Replace G-G6GXJWW0F1 with your real GA4 Measurement ID
// in the gtag snippet added to each HTML page's <head>.

/**
 * Fire a GA4 custom event. Fails silently if gtag is not loaded.
 * @param {string} eventName
 * @param {Object} [params]
 */
function trackEvent(eventName, params) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params || {});
    }
  } catch (e) { /* fail silently */ }
}
