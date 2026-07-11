# Privacy Policy
*Last Updated: June 27, 2026*

This Privacy Policy details the privacy practices for the Codeoba local desktop application (the "App") and the codeoba.com website (the "Site"). Both the App and the Site are developed, published, and operated by What AI Can Do, LLC (the "Company").

Please read this policy carefully. If you do not agree with the terms outlined herein, please do not use the App or the Site.

---

## 1. Core Principle: Local-First by Default
> Codeoba is built to be a local-first application. All dialogue transcripts, database indices, caches, and semantic models are stored entirely on your local machine.

Key aspects of this local-first implementation include:
- **Zero Remote Logs:** Conversation transcripts aggregated from local assistant directories (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot, etc.) are processed offline and parsed directly inside the desktop client's runtime on your device.
- **Local SQLite Database & Cache:** All indexed turns, logs, search keywords, and performance data are persisted in a local cache directory.
- **Local Vector Indexing:** For semantic query matching, the application downloads a quantized transformer model (all-MiniLM-L6-v2) locally. All conceptual calculations and search lookups are run on your machine's CPU with no third-party API transmissions.

## 2. Diagnostics & Auto-Update Checks
To keep the platform operational, safe, and secure, Codeoba performs basic diagnostic updates:
- **Software Auto-Update Checks:** If you explicitly consent, the App queries our update server to check for the latest versions. Standard network parameters (such as the application version and language preference, along with the operating system version and CPU architecture) are sent to retrieve the release manifest, but no personal or conversation data is collected.
- **Telemetry & Diagnostics Logging:** To monitor service health and prevent API rate-limiting abuse, update requests are logged to GCP Cloud Logging that inherently knows the client IP address that requests come from. These logs capture OS details and the anonymous installation GUID. All such logs are retained for 30 days and then automatically permanently deleted.

## 3. Website Analytics & Cookie Consent
To analyze visitor traffic and monitor download rates, the Site utilizes Google Analytics (GA4). By default, analytics tracking is completely disabled and no cookies are loaded.

When you visit the Site, a privacy consent banner is presented:
- **Consent Accepted:** If you accept tracking, we load Google Analytics dynamically. Google Analytics will place persistent identifiers (cookies like _ga and _ga_<container-id>) to track anonymous pageviews and download clicks. Your IP address is anonymized.
- **Consent Declined:** If you decline, the Google Analytics script is never loaded. No cookies are stored, and no device fingerprinting pings are dispatched.

You can withdraw or reset your choice at any time: [Manage Privacy Preferences](#) (this clears your saved choice and displays the consent banner again immediately).

## 4. Sharing of Your Information
We do not sell, rent, or trade your personal data. We share only the limited technical information necessary to operate our update and diagnostics service with the trusted third-party service provider (subprocessor) below:
- **Cloud Infrastructure:** We use Google Cloud Platform (GCP) Cloud Logging to store standard telemetry logs (such as IP addresses and device info for update checks) for diagnostic and security purposes. These logs are automatically purged after 30 days.

## 5. Security of Your Local Data
Because your data is stored locally, the security of your indexed transcripts relies on the security of your own device. We recommend securing your machine with standard encryption tools (such as FileVault on macOS) and strong passwords.

## 6. Changes to This Privacy Policy
The Company reserves the right to modify this Privacy Policy. Any modifications will be updated on this page with a revised "Last Updated" date. Checking this page periodically is recommended to stay informed of these data practices.

## 7. Contact Us
If you have any questions or would like to discuss these privacy practices, please contact the Company:
- **Email:** privacy@whataicando.com
- **Organization:** What AI Can Do, LLC
- **Web:** [whataicando.com](https://whataicando.com)
