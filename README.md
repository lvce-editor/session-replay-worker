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

## GitHub Pages

Open exported JSON recordings at [the session replay player](https://lvce-editor.github.io/session-replay-worker/). Recordings are read locally in the browser and are not uploaded.

`npm run build:static` creates the site in `.tmp/static`. Pushes to `main` deploy that directory to GitHub Pages after the tests pass. The repository's Pages source must be set to GitHub Actions.

## Development

`npm run type-check` checks TypeScript types across the workspace projects. PR, main, and release workflows run this check.

`npm run lint` checks ESLint rules, Prettier formatting, and unused code and dependencies with Knip. Run `npm run format` to apply formatting.

The repository follows the npm workspace layout used by explorer-view and about-view:

- `packages/session-replay-worker`: runtime source modules, package exports, and unit tests.
- `packages/build`: bundles the worker and browser adapters into a standalone package at `.tmp/dist`, including its package manifest, README, and license.
- `packages/e2e`: Playwright configuration, browser fixtures, test server, and replay scenarios. These tests serve the built package.

Run `npm ci` to install workspace dependencies, `npm run build` to create the distribution, and `npm test` to run the worker and package checks. Install Chromium with `npm exec --workspace=packages/e2e -- playwright install chromium`, then run `npm run e2e` (or `npm run e2e:headless`). The e2e server builds the distribution before starting. Formatting is shared at the root through `npm run format:check`.

The distribution retains the `@lvce-editor/session-replay-worker` name and the `./capture`, `./client`, `./player`, and `./worker` exports. Its standalone worker entry is `dist/sessionReplayWorkerMain.js`. Build versions follow `RG_VERSION`, `GIT_TAG`, or an exact Git tag, falling back to `0.0.0-dev`.

Existing renderer and backend consumers remain pinned to the earlier flat-layout Git commit. For new local integrations, install the built `.tmp/dist` package; the monorepo root is private and is not the runtime package. Pull requests and pushes to `main` run the PR and CI workflows across Linux, macOS, and Windows. Pushing a version tag such as `v1.0.0` runs the release workflow, which validates the tagged build, publishes `.tmp/dist` to npm using the `NPM_TOKEN` repository secret, and publishes the GitHub release.
