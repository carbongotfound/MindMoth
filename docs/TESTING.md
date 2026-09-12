# Testing and release scope

## Automated checks included

- Node tests execute model migration, health/stage bounds, pause expiry, focus completion idempotence, streak-gap handling, review timing/phrases/heartbeats, origin validation, concurrent writes and cooldown enforcement.
- `tools/check_release.py` parses the manifest, verifies assets and entrypoints, and asks Node to parse each script in the correct classic/module mode. When a local `website/` folder is present it also checks those resources and expected GitHub links; OSS checkouts skip that section.
- `tests/browser_harness.py` renders the actual extension modules in Chromium using locally supplied HTML and data modules. A test-only adapter supplies extension APIs, shared storage, tab URLs and foreground signals. Real mouse, keyboard, input, checkbox and layout behaviours are exercised. Long cooling-off waits use a clock fixture; the final eight-second held confirmation is exercised in real time.

This container's managed Chromium does not allow unpacked extension installation. The harness does not change those policies. These are **not native Opera GX, browser-store, real X-page or installed-extension tests**. Screenshots show rendered code with fixture data, not new generated mockups.

## Manual release checklist

- [ ] Load the ZIP on current Chrome and Opera GX and record browser versions.
- [ ] Update an existing extension in the same folder and confirm settings/history survive.
- [ ] Test X, Instagram, TikTok and YouTube, including direct posts/videos and multiple tabs.
- [ ] Finish a temporary unlock and confirm clicks, typing and media controls work, then relock.
- [ ] Complete and cancel each protection review; verify pause auto-restoration.
- [ ] Restart the worker/browser and test laptop sleep/wake during focus and cooldown.
- [ ] Inspect midnight rollover, missing days and completed focus records.
- [ ] Review store/trademark requirements before store submission.

Known scope limitations are documented in README and SECURITY. A passing test suite is not a promise of a bug-free release.
