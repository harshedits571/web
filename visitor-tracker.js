// ============================================
// Visitor Tracker — Powered by Firebase
// Tracks: total visits, unique visitors, daily stats
// ============================================

(function () {
    // Wait for Firebase to be ready
    function initTracker() {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
            setTimeout(initTracker, 500);
            return;
        }

        const db = firebase.database();
        const today = new Date().toISOString().split('T')[0]; // e.g. "2026-03-01"
        const sessionKey = 'he_visited_' + today;

        // Always increment total page views
        db.ref('analytics/totalPageViews').transaction(current => (current || 0) + 1);

        // Increment daily page views
        db.ref('analytics/daily/' + today + '/pageViews').transaction(current => (current || 0) + 1);

        // Track UNIQUE visitors using sessionStorage (once per browser session per day)
        if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, '1');

            // Increment unique visitors total
            db.ref('analytics/uniqueVisitors').transaction(current => (current || 0) + 1);

            // Increment daily unique visitors
            db.ref('analytics/daily/' + today + '/uniqueVisitors').transaction(current => (current || 0) + 1);

            // Track country (best-effort via timezone)
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
            const country = tz.split('/')[0] || 'Unknown';
            db.ref('analytics/byRegion/' + country.replace(/[.#$[\]]/g, '_')).transaction(c => (c || 0) + 1);

            // Track device type
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const deviceType = isMobile ? 'mobile' : 'desktop';
            db.ref('analytics/byDevice/' + deviceType).transaction(c => (c || 0) + 1);
        }
    }

    initTracker();
})();
