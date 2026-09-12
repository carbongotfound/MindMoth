# Privacy

MindMoth 1.1.0 has no telemetry, account system, advertising SDK, remote model, or usage-upload endpoint. Artwork and service logos are bundled. The website is static and has no analytics code; its hosting provider and GitHub handle normal web requests under their own policies.

## Stored locally in the extension

- Theme, daily goal, service protection and pause deadlines.
- Active-use seconds per protected service, daily goal snapshots, completed focus counts/minutes and close-instead counts. Up to 90 recorded dates are retained.
- Current focus deadline, temporary service allowances and repeat-visit cooldowns.
- Written protection-review answers and progress until completion, cancellation or expiry.
- Intervention drafts keyed by the browser tab and service, with a one-day expiry. They are stored in extension storage, not the website's sessionStorage. Closing a tab removes its drafts when the browser reports that event.

Settings exports the persistent usage/settings model as a local JSON file. No data is sent by that export. Resetting local data is an explicit reviewed action. Uninstalling through browser controls is always available.

Interventions are displayed inside a protected website's document. Do not enter passwords, financial details or other sensitive information into an intention field. The overlay is a behavioural aid, not a confidential input surface isolated from a hostile webpage.

Creator and GitHub links open normal external webpages only when selected. Data is not synchronized between browsers or profiles. Browser permissions are limited to storage, tabs, alarms and the protected domains; there is no `<all_urls>` permission.
