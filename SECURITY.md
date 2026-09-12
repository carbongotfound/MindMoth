# Security and scope

MindMoth is voluntary friction software, not parental-control, endpoint-security or anti-uninstall software. A user who controls their browser can disable it, edit its source or use another browser. We do not claim otherwise.

The background worker serializes mutations, validates sender identity and service origin, caps temporary allowances, retains cooldowns across attempt-window resets, and verifies review deadlines/active reading/held-confirmation heartbeats before changing protection. UI-only actions reject content-script callers. Drafts and settings use extension storage.

The content overlay uses Shadow DOM, full-page inert/input guards and a stable shell. It does not offer strong isolation from a hostile webpage. Avoid sensitive text in its fields. A normal browser extension reload requires refreshing existing content-script tabs.

Report reproducible bugs through GitHub Issues without including private browsing history or written review answers. For a sensitive vulnerability, use GitHub's private vulnerability reporting if the repository owner enables it.

Before a wider release, test native installations in Chrome and Opera GX, permission restrictions, service-worker restarts, sleep/wake, midnight rollover, and upgrading over a previous loaded folder. The included automated harness does not replace those checks.
