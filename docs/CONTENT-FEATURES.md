# Content visibility and automatic detection

Implementation evidence, 2026-10-05. These changes share the checkout with the independently implemented performance and image-upload settings work.

## Content visibility

Home can hide the current local file or its folder, including subfolders. Settings lists and removes saved exclusions. Both interfaces support English and Spanish. Exclusions persist in app configuration and compare full normalized paths, with case-insensitive Windows matching and directory boundaries.

Visibility controls request the local URI separately from catalog enrichment, so a slow search does not delay hiding a file. A click rereads the current URI and refuses an outdated file. Unknown or invalid local URIs wait when exclusions exist. Known web streams remain allowed. Different playlist items with the same audio title discard the previous item's privacy and enrichment.

Exclusions clear Discord activity, block new lookups and local image uploads, cancel uploads in progress, and prevent a late result from republishing excluded content. They do not remove images already uploaded to a host. Rules follow paths; renaming, moving or opening through a different path can put a file outside a saved rule.

## Automatic detection

Ungrouped filenames now use AniList too: a release-group tag is not needed to recognize anime. The strict title/alias gate remains. A conflicting year rejects a same-title result for a plain first-season or film filename. If a base search misses the requested sequel, one additional season query is scored against the original title and episode context.

Season and arc posters have separate cache identities; a fresh catalog poster outranks a cached guess. Concurrent episodes sharing a lookup keep their own episode numbers. Explicit music remaster suffixes are removed for searching and matching, while artist checks and live/remix titles remain. Existing correction identities are preserved. Catalog and music cache versions invalidate earlier misses and guesses.

Catalogs may not identify a sequel separately; the existing franchise fallback remains in that case. Episode naming and audio fingerprints still depend on the existing providers. No dependency or new service key was added.

## Verification

| Check | Command / scenario | Result |
| --- | --- | --- |
| Focused behavior | `bun run test src/main/features/catalog src/main/features/music src/main/features/privacy src/main/features/cover/cover.video.test.ts src/renderer/src/features/media` | 429 tests, 27 files passed |
| Shared checkout | `bun run test` | 944 tests, 64 files passed after numbered-film detection |
| Types and bundle | `bun run build` | Node, renderer and E2E types passed; Electron bundles built |
| Style | `bun run lint:check`, `git diff --check` | Passed |
| Native flows | `bunx playwright test` | 4 passed with isolated settings, local VLC HTTP and simulated Discord RPC |
| Final visual adjustment | `bunx playwright test --grep 'hides a file'` | Passed after bounding the panels at 200% zoom |

The privacy flow activates hiding with the keyboard, restarts the app, restores the file, excludes a folder and its child folder, allows a similarly named sibling, removes the rule in Settings, and checks Spanish text. Screenshots in `test-results/app-hides-a-file-across-re-d96df-ers-and-restores-visibility/` were visually inspected: `hidden-file.png`, `saved-exclusions.png`, `exclusions-es.png`, and the native `excluded-folder-zoom.png` capture. The zoom test asserts the visibility panel and its restore button remain inside the viewport. Renderer tests check early visibility during pending enrichment and reject stale privacy replies. Matching tests include unrelated titles, conflicting years, different artists and live recordings.

Network recognition tests use catalog fixtures and controlled responses. The native harness disables external requests; it verifies the app's HTTP/RPC and persistence boundaries, rather than live provider availability.

## Antislop delivery gate — new privacy controls

Design read: utility controls for VLC/Discord users, following the existing dark panels, typography and buttons. ENERGY 1 / RHYTHM 1 / MOTION 1. Visibility sits between the Discord preview and source information because the action concerns the file shown there; Settings holds persistent rules. Paths wrap to expose the scope. Button borders use an existing text token to identify actionable controls. No new animation was introduced.

- Hard gates PASS: controls invoke typed handlers; pending, empty, unavailable-file and error states are explicit. Native screenshots show real app content. No decorative illustrations or invented claims were added.
- Purpose gates PASS: each panel contains current visibility or saved rules. Existing surfaces and restrained button motion serve grouping and feedback. The only new outline serves button recognition.
- Liveliness PASS: the existing Discord preview remains the Home focal point; current-file actions follow it, and saved paths use the existing Settings hierarchy. Palette, font, spacing and motion remain consistent with the app.
- Craftsmanship PASS: hide/restore/remove and persistence pass native flows; keyboard activation and focus are visible. New panels fit at 200% zoom. English and Spanish states were inspected. WCAG contrast calculation from existing HSL tokens gives body/card 11.09:1, caption/card 5.59:1, button label/fill 8.30:1, button outline/fill 4.19:1, focus/fill 8.79:1, and error/card 6.40:1.

## Rollback boundaries

The behavior units are grouped with their tests, README explanations and changesets.

**Visibility:** remove `src/main/features/privacy/`, `src/shared/privacy/`, `content-visibility.tsx`, `exclusions-panel.tsx`, `media.privacy.test.ts` and `.changeset/content-exclusions.md`. Remove only privacy-specific constructor callbacks/checks and wiring in `main.ts`, Discord, media, cover and presence; privacy fields/channels in shared/config/preload; renderer privacy refresh/mapping/hooks/mounts and translations; and the privacy native-flow scenario. Keep the independent performance and upload-opt-out changes in these shared files. The playlist identity/URI preservation fix can remain as a separate correctness improvement.

**Detection:** revert the authored changes in `catalog.anilist.ts`, `catalog.resolver.ts`, `catalog.scorer.ts`, `catalog.cache.ts`, `cover.video.ts`, `music.resolver.ts`, `music.scorer.ts` and `music.cache.ts`, with their matching tests. Remove `music.title.ts`, `music.title.test.ts` and `.changeset/automatic-season-detection.md`, and the detection-specific README text. This unit does not require reverting exclusions or the independent performance work. Removing the cache-version bump may force another lookup; it does not alter saved corrections.
