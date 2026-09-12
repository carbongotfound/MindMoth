# Architecture

## Single writer

All runtime state mutations go through `background/service-worker.js`, using a serialized promise chain. Extension pages use `lib/api.js` with callback-compatible runtime messaging, explicit errors and a timeout. The background listener returns literal `true` for asynchronous responses. Persisted deadlines survive worker restarts; no long-running worker timer is required.

`lib/state.js` retains the earlier `mindmoth:model:v1` storage key and migrates its schema to version 2. `lib/review.js` is independently testable friction policy. `lib/ui.js` calculates actual milestones without manufacturing activity.

## Full-domain blocker

The content script starts at document_start for four service domains and aliases. It applies a body-inert and input guard while locked and creates a stable Shadow DOM shell outside the inert body. Events reach blocker controls first, then are stopped in the bubble phase. Unlocking disconnects the mutation observer, removes inert and restores normal interactions. Site SPAs do not cause full dashboard remounts.

A service allowance is shared across that domain's tabs. The worker caps it at 90 seconds in Aggressive mode (30 for scrolling). Focus takes precedence. Existing tabs receive state-change notifications. Local timers improve immediacy, while absolute deadlines are authoritative.

## Reviewed exceptions

START_REVIEW stores three answers, a policy and absolute readyAt. READ_REVIEW credits only short consecutive foreground-reading heartbeats. BEGIN_REVIEW_HOLD validates both waits and the phrase. Periodic hold heartbeats must remain active. FINISH_REVIEW revalidates everything and applies a pause/off/early-focus-stop/reset/weaken action. Browser uninstall controls are not intercepted.

## Stable UI

Dashboard delegation handles navigation without rebuilding from background usage ticks. Explicit chip changes update selected attributes in place. Timer ticks update text, not the whole page. Review controls sit in a separate stable dialog. Popup timer updates are similarly local.

## Artwork and website

Artwork is real local image data, not a dashboard screenshot under invisible hotspots. Layout, text and buttons remain native HTML/CSS. Flat moth poses replace the old brain assets. The public product site (https://mindmoth.vercel.app) has no extension APIs, runtime dependencies or build step; its CTAs point to this GitHub repository. Site source is not included in the open-source tree.
