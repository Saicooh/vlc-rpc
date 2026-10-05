# Testing

`bun run test` runs the unit and feature suites without VLC, Discord or network access.
`bun run typecheck` also checks the Electron test code.

On Windows, run `bun run test:e2e` to build the app and test the renderer, preload bridge and main
process together. Playwright uses the repository's Electron binary, so no browser download is
needed. Other operating systems skip these flows because published builds target Windows.

The four scenarios cover:

- First-run configuration writes VLC's HTTP settings and preserves the local image upload choice
  through setup and an app restart.
- VLC and Discord disconnections clear or restore activity, with presence commands reaching a
  simulated Discord server over its RPC protocol.
- A correction reaches Discord, survives closing the window to the tray, and remains after restart.
- Hiding a file survives restart; folder exclusions cover subfolders, allow similarly named sibling
  folders and can be removed. The controls support keyboard use, Spanish and 200% zoom.

Each test gets a temporary profile, VLC configuration and RPC pipe. The test launcher changes only
transport addresses and process discovery; the application handlers and renderer run from the
normal compiled bundle. External fetch requests are rejected, and the tests do not use the
developer's Discord or VLC settings. Temporary profiles are removed after the app exits.

These flows exercise the compiled app with simulated peers. They do not install NSIS packages,
test a real Discord account, or download and install updates. Unit tests separately verify that
disabling local uploads prevents host requests, aborts uploads already running, ignores saved
local artwork URLs and keeps catalog thumbnails available.

Failed flows save a screenshot under `test-results/`, which CI uploads as an artifact. Successful
first-run tests also save the onboarding and privacy settings screenshots there for visual review.

Grouped-commit validation on 2026-10-05: `bun run test` passed 944 tests in 64 files;
`bun run test:e2e` passed all 4 flows after building the app and checking Node, renderer and E2E
types. `bun run lint:check` and `git diff --check` passed. The detection, numbered-film,
performance and privacy commits were also checked from isolated intermediate snapshots.
