# Session replay worker

Opt-in visual session recording and playback for LVCE Editor. No application commands from a recording are executed. The player starts only a session replay worker.

## Enable recording

Set `sessionReplay.enabled` to `true` to save locally in IndexedDB. Set `sessionReplay.uploadEnabled` to `true` to stream to the backend. Both default to `false` and operate independently. Enable recording before reloading the window. Command recordings need the complete startup history, so enabling or starting a new segment after startup requires a reload. Disabling stops recording immediately; existing proxy connections continue forwarding until reload. Recordings contain visible source code, file names, and diagnostic messages; enable recording only for sessions you intend to share. Password fields, explicitly masked DOM (`data-session-replay-mask`) and named credential fields in messages are redacted. This is not a guarantee that arbitrary application messages contain no secrets.

Recordings include the recording browser’s user agent and platform in session metadata, captured once at the start and sent with the initial upload request.

Use **SessionReplay: Download Session** to export a versioned JSON file. **SessionReplay: Replay Current Session** opens a new tab from local storage; **SessionReplay: Open Session** opens a file chooser in a separate replay tab. Local recordings are scoped to the editor origin/profile. Administrators can browse `/session-replay` on the backend and open recordings in new tabs.

Uploads use the configured layout backend and existing bearer/cookie authentication. To allow uploads without signing in, enable `sessionReplay.allowAnonymousUploads` as well as `sessionReplay.uploadEnabled`. The anonymous upload setting defaults to `false`; the `allowAnonymous=true` editor URL parameter remains supported. Anonymous creation is permitted only by `POST /session-replay?allowAnonymous=true`; append requests also carry that opt-in and the server-issued write token. Invalid supplied authentication is not downgraded. Reads and the list always require administrator access.

All three settings are declared in `packages/session-replay-worker/settings.json` with their types, defaults, and descriptions. The npm package includes them in `dist/settings.json`, also exposed as `@lvce-editor/session-replay-worker/settings`, for the editor's builtin settings collection.

## Format and rendering

A version 1 session has `id`, `createdAt`, and `events`. Each event has a contiguous zero-based `sequence`, monotonic relative `timestamp` in milliseconds, `type` (`message` or `frame`), and `data`.

Command recording takes one initial frame for the page shell, readable styles and viewport. That frame has `commandReplay: true`. The replay worker then proxies the renderer connection in both directions, recursively wrapping transferred message ports. Requests, notifications, responses, errors, buffers, streams and ports retain their transport semantics. Recording and serialization happen inside the worker. There is no MutationObserver or periodic DOM/CSS snapshot on this path. Recording failures stop capture without stopping forwarding.

Visual playback interprets an allowlist of virtual DOM, tree patch, component-reference, input-value, bounds and stylesheet commands. Direct view-worker batches are associated with their queue replies and applied at the matching commit. Forward seeks apply new events incrementally; backward seeks rebuild from the initial state. Arbitrary application RPCs are never executed. Existing snapshot recordings and the legacy `observe` API remain supported for compatibility.

Canvas/terminal content, embedded webviews, legacy view-specific renderer methods, browser-only state changes that generate no DOM command, external resources, shadow DOM and CSS animation timing are not reproduced. The player uses an inert document that blocks scripts and network resource loads. Password values and explicitly masked virtual DOM text are redacted before storage; later value/text patches for a view containing masked content are also redacted conservatively. Diagnostics can still contain visible code and other application data.

The in-memory session limit is 64 MiB, with 750 KB per event and batches below the backend's 1 MB body limit. Local events commit to IndexedDB in order. Uploads flush every two seconds, retry the same batch after failure, and use server deduplication. Failed pending uploads survive while the recording worker is alive; automatic retry after closing the tab is not supported. Local recordings remain exportable. Local storage follows browser quota/eviction policies; there is no automatic local retention cleanup yet.

## GitHub Pages

Open exported JSON recordings at [the session replay player](https://lvce-editor.github.io/session-replay-worker/). Recordings are read locally in the browser and are not uploaded.

`npm run build:static` creates the site in `.tmp/static`. Pushes to `main` deploy that directory to GitHub Pages after the tests pass. The repository's Pages source must be set to GitHub Actions.

## Development

`npm run type-check` runs `tsc -b` using the root `tsconfig.json`, which references the self-contained configs in each package. The package configs use `composite` for incremental checking. The e2e config also includes the worker API sources imported by its browser fixture, while `tsconfig.tools.json` checks the root ESLint config and browser demo. PR, main, and release workflows run this check.

`npm run lint` checks ESLint rules, Prettier formatting, and unused code and dependencies with Knip. Run `npm run format` to apply formatting.

The repository follows the npm workspace layout used by explorer-view and about-view:

- `packages/session-replay-worker`: TypeScript runtime modules, renderer API, package exports, and unit tests.
- `packages/build`: bundles the worker and compiles the browser API with declarations into a standalone package at `.tmp/dist`, including its package manifest, README, and license.
- `packages/e2e`: Playwright configuration, browser fixtures, test server, and replay scenarios. These tests serve the built package.

Run `npm ci` to install workspace dependencies, `npm run build` to create the distribution, and `npm test` to run the worker and package checks. Install Chromium with `npm exec --workspace=packages/e2e -- playwright install chromium`, then run `npm run e2e` (or `npm run e2e:headless`). The e2e server builds the distribution before starting. Run `npm run type-check` for strict checking of the runtime, build scripts, and tests. Node 24 runs the TypeScript build tooling directly; Jest runs the unit tests through ts-jest. Formatting is shared at the root through `npm run format:check`.

The npm distribution exposes two main entry points:

- `@lvce-editor/session-replay-worker/worker`: the standalone bundled worker at `dist/sessionReplayWorkerMain.js`.
- `@lvce-editor/session-replay-worker/api`: the renderer-process API at `dist/api/index.js`, with TypeScript declarations. It exports `capture`, `observe`, `serializeMessage`, `createClient`, `renderFrame`, and `mountPlayer`, plus the public recording and playback types.

The existing `./capture`, `./client`, and `./player` exports remain typed aliases to modules under `dist/api/`. Existing browser asset URLs (`dist/capture.js`, `dist/client.js`, `dist/player.js`) also remain available. Importing the API does not start a worker; pass the deployed worker asset URL to `createClient` or `mountPlayer`.

```ts
import { capture, createClient } from '@lvce-editor/session-replay-worker/api'

// Serve the package's bundled worker at this URL.
const client = createClient('/dist/sessionReplayWorkerMain.js')
await client.invoke('start', { local: true, upload: false })
await client.invoke('record', 'frame', capture(document))
const session = await client.invoke('export')
await client.invoke('stop')
client.dispose()
```

Build versions follow `RG_VERSION`, `GIT_TAG`, or an exact Git tag, falling back to `0.0.0-dev`.

Existing renderer and backend consumers remain pinned to the earlier flat-layout Git commit. For new local integrations, install the built `.tmp/dist` package; the monorepo root is private and is not the runtime package. Pull requests and pushes to `main` run the PR and CI workflows across Linux, macOS, and Windows. Pushing a version tag such as `v1.0.0` runs the release workflow, which validates the tagged build, publishes `.tmp/dist` to npm using the `NPM_TOKEN` repository secret, and publishes the GitHub release.

When hosting recordings from another editor build, pass `assetBaseUrl` to
`mountPlayer`, for example `/session-replay-assets/lvce-editor/`. Serve the editor's
`icons`, `fonts`, and `file-icons` directories there. The player maps recorded
asset paths to this same-origin directory, including old commit prefixes and
Electron file URLs. Other recorded network resources remain blocked. Without
this option, playback continues to permit only embedded image and font data.
