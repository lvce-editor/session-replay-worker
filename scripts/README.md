# Editor integration test

`npm run test:session-replay` runs the migrated LVCE Editor acceptance coverage.
The `Editor integration` workflow installs a pinned LVCE Editor checkout in
`.tmp/lvce-editor` and replaces its `sessionReplayWorkerMain.js` with this repository's
build before running the test. This keeps the real editor integration covered
while testing the worker from the current branch. No sibling checkout is required.

To run locally, reproduce the fixture setup in
[the workflow](../.github/workflows/editor-e2e.yml), then run the npm script
. Update the pinned editor commit explicitly when its harness needs changes.
