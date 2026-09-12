# Install and update

## First installation

1. Download and extract the extension ZIP into a permanent folder such as `Documents/MindMoth/extension`. It must contain `manifest.json`, `background`, `content`, `dashboard`, `popup`, `lib`, and `assets`.
2. Open `chrome://extensions` in Chrome or `opera://extensions` in Opera GX. Enable **Developer mode**.
3. Select **Load unpacked** and choose that folder. For the full repository ZIP, choose its `src` folder.
4. Pin MindMoth from the browser's extension menu. Open the toolbar popup, then **Open MindMoth dashboard**. Refresh existing supported-site tabs.

Installation is manual during the public beta. MindMoth never silently modifies browser profiles or bypasses security warnings. There is no Windows executable.

## Update without losing data

Keep the same folder already selected by Load unpacked. Copy the new extension ZIP contents over its files. In the extensions page, click **Reload** on MindMoth. Refresh the dashboard and every open X, YouTube, Instagram and TikTok tab.

Confirm **1.1.0** in the browser's extension details. Removing the extension, loading a different folder as a second copy, or switching profiles can produce a different extension ID and separate data. Export local data from Settings before major changes.

Disable old Brainrot/MindMoth prototype copies before using this one. Two blockers in the same tab can interfere with each other.

## Themes

Dark is the default. Open the dashboard, Settings, and choose **Light** for the cream/pastel theme shown in the README. Theme changes do not change protection strength.

## A website is not protected

Check that you are in the browser/profile where MindMoth is installed, its service is enabled, and the browser permits it on the site. In private browsing, grant permission separately through browser extension settings. This build protects only its four listed services, not arbitrary websites or native apps.

## A dashboard tab from an older build is blank

Reload the extension from its management page, close the old dashboard tab, then reopen it from the toolbar popup. Refresh protected tabs too. If an error remains, capture the error text and browser version for an issue. Do not reset data just to troubleshoot a display problem.
