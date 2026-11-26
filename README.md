# Daily Press · Web edition

Install-free English news study app by Mohani Lab. Static HTML, CSS and JavaScript, ready for GitHub Pages. No application server or package installation is required for hosting.

## Getting started

1. Open the published HTTPS site.
2. In **Settings → AI connection**, choose a service and enter your own API key.
3. Paste the entire article in **Today** and press **Save & generate**.
4. Read the original, Korean translation, paragraph vocabulary and bilingual summary. Answer the questions to save your score in History.

**Gemini:** Use a Google AI Studio Free tier project without linked billing. The app checks model access but cannot independently verify your billing tier or remaining quota. Free-tier inputs may be used to improve Google products. Limits apply. The selected model is `gemini-3.1-flash-lite`; availability and terms can change.

**OpenAI:** Uses `gpt-4.1-mini` and your API balance. Choosing this service can incur usage charges. It is never selected automatically as a fallback. ChatGPT and API billing are separate services.

Each generation makes one request. The body appears once in that request. Cached results are reused, and an origin-wide lock prevents overlapping duplicate generation across tabs. There are no automatic retries or provider changes. After a timeout or closing a tab during generation, a processed request may still count toward provider usage.

## Data and privacy

- Articles, translations, quizzes and history stay in IndexedDB in this browser, under this site address. They are not uploaded to GitHub.
- The selected AI service receives article text only when generating a study set or completing missing reading material.
- Your key stays in this tab's session storage, survives refresh, and is excluded from backups. Disconnect to remove it. Browser session restoration may restore session storage; do not connect on a shared device.
- No analytics, external scripts, remote fonts or shared API keys are included.
- Export a backup in Settings before clearing site data, moving devices or changing the site address. Import adds non-conflicting records; existing articles are kept. It is not automatic cloud sync.
- The previous Android app's private phone database is not automatically accessible to this website. Android data needs an export from that app before it can be imported; an APK alone does not contain the user's current phone database.

## GitHub Pages

Upload only the files in this directory to a public repository. Never upload the parent workspace, databases, user backups, signing keys or credentials.

Under repository **Settings → Pages**, select **GitHub Actions** as the source. The included workflow checks the JavaScript, checks for accidentally embedded keys, packages only the public app files and publishes them. Open the HTTPS address shown by GitHub. Relative asset paths support project sites such as `https://USERNAME.github.io/daily-press-web/`.

For updates, replace these application files and commit to `main`. GitHub Actions automatically calculates a new cache version and publishes the update. The service worker shows an update banner; **Save & update** activates it. The database is separate from cached app files. Keep the site address unchanged to preserve browser data.

For manual static hosting, run `node scripts/prepare-pages.cjs` and publish only `_site/`. No third-party packages are needed.

## Reminders and offline use

Settings exports a recurring calendar event with an alarm. Your calendar controls delivery; completed days are not automatically skipped. A static webpage cannot guarantee native-style timed alarms while closed.

After the first online visit, the app shell and saved articles are available offline in supporting browsers. New AI generation needs internet access. For reliable storage and AI access, use HTTPS or localhost rather than opening `index.html` as a `file://` URL.

## Verification

Tested in desktop Edge and a mobile-sized browser: saving, both provider request/response formats with mocked responses, adaptive quiz count, translation numbering, bilingual summary, all explanations, wrong-only review, History calendar, edit/delete/restore, backup validation/import, reload persistence, quota handling without fallback, cross-tab duplicate prevention, offline access and explicit updates. Real-account Gemini quota, live model quality and a physical phone still require checking with the owner's key.

Official references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Gemini billing](https://aistudio.google.com/docs/billing), [Gemini pricing](https://aistudio.google.com/docs/pricing).
