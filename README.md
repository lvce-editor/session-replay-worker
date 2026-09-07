# Session replay worker

Opt-in visual session recording and playback for LVCE Editor. No application commands from a recording are executed. The player starts only a session replay worker.

## Enable recording

Set `sessionReplay.enabled` to `true` to save locally in IndexedDB. Set `sessionReplay.uploadEnabled` to `true` to stream to the backend. Both default to `false` and operate independently. Changes apply immediately and start a new recording segment. Recordings contain visible source code, file names, and diagnostic messages; enable recording only for sessions you intend to share. Password fields, explicitly masked DOM (`data-session-replay-mask`) and named credential fields in messages are redacted. This is not a guarantee that arbitrary application messages contain no secrets.

Use **SessionReplay: Download Session** to export a versioned JSON file. **SessionReplay: Replay Current Session** opens a new tab from local storage; **SessionReplay: Open Session** opens a file chooser in a separate replay tab. Local recordings are scoped to the editor origin/profile. Administrators can browse `/session-replay` on the backend and open recordings in new tabs.

Uploads use the configured layout backend and existing bearer/cookie authentication. For temporary anonymous uploads, add `allowAnonymous=true` to the editor URL as well as enabling upload. Anonymous creation is permitted only by `POST /session-replay?allowAnonymous=true`; append requests also carry that opt-in and the server-issued write token. Invalid supplied authentication is not downgraded. Reads and the list always require administrator access.

## Format and rendering

A version 1 session has `id`, `createdAt`, and `events`. Each event has a contiguous zero-based `sequence`, monotonic relative `timestamp` in milliseconds, `type` (`message` or `frame`), and `data`. A visual frame contains an assembled DOM tree, readable stylesheet rules, viewport dimensions, form values and scroll offsets. The capture adapter stitches the already rendered view components together; the worker owns recording order, storage, upload batching, loading and frame selection. Capturing the assembled DOM covers direct view-worker patches and legacy renderer commands without duplicating their implementation.

Frames are sampled at 100 ms while the DOM or CSS changes. Playback uses the last complete visual frame at a requested time, selected with binary search. Seeking backwards restores an earlier frame directly. Transient states between samples are not represented. Canvas/terminal content, embedded webviews and native surfaces are gray placeholders. Cross-origin stylesheets, external images and fonts, shadow DOM and CSS animation timing are not currently reproduced. The inert replay document blocks network resource loads and scripts, including from imported recordings.

The in-memory session limit is 64 MiB, with 750 KB per event and batches below the backend's 1 MB body limit. Local events commit to IndexedDB in order. Uploads flush every two seconds, retry the same batch after failure, and use server deduplication. Failed pending uploads survive while the recording worker is alive; automatic retry after closing the tab is not supported. Local recordings remain exportable. Local storage follows browser quota/eviction policies; there is no automatic local retention cleanup yet.

## Development

`npm run lint` checks ESLint rules, Prettier formatting, and unused code and dependencies with Knip. Run `npm run format` to apply formatting.

`npm ci`, `npm test`, and `npm run e2e` run unit tests and Chromium browser tests. Install Chromium with `npx playwright install chromium` first. The package contains build-free ES modules and can be installed from an immutable Git commit until npm publishing is configured. Consumers bundle `src/worker.js` as a separate module worker alongside their renderer bundle; the backend copies the source modules to its static player assets.
