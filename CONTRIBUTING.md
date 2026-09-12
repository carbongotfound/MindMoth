# Contributing

Start with a GitHub issue or focused pull request. Keep the app dependency-light, local-first and accessible.

1. Fork/clone the repository and load `src/` as an unpacked extension.
2. Run `npm test` and `python tools/check_release.py`.
3. For UI changes, run the Chromium DOM harness and inspect light/dark screenshots. Test a native browser install separately.
4. Keep content, popup and dashboard controls keyboard-usable. Never reintroduce native dropdowns or passive whole-dashboard refresh loops.
5. Do not weaken protection by adding a direct disable/reset/early-stop button. Route exceptions through the worker's review protocol.
6. Preserve state migration, local-only data and the narrow host-permission list. No remote code, analytics, fake user counts or invented milestone progress.
7. Package with `python tools/package_extension.py`; do not commit cache folders, old ZIPs, credentials or node_modules.

Source layout: `src/background` is the mutation authority; `src/lib` has pure model/rule/UI helpers; `src/content` injects the website blocker; `src/dashboard` and `src/popup` are extension pages. The public product site is https://mindmoth.vercel.app (site source is not in this repository). See docs/ARCHITECTURE.md and docs/ASSETS.md.
