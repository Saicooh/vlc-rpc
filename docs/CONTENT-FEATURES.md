# Automatic content detection

Ungrouped filenames now use AniList too: a release-group tag is not needed to recognize anime. The strict title/alias gate remains. A conflicting year rejects a same-title result for a plain first-season or film filename. If a base search misses the requested sequel, one additional season query is scored against the original title and episode context.

Season and arc posters have separate cache identities; a fresh catalog poster outranks a cached guess. Concurrent episodes sharing a lookup keep their own episode numbers. Explicit music remaster suffixes are removed for searching and matching, while artist checks and live/remix titles remain. Existing correction identities are preserved. Catalog and music cache versions invalidate earlier misses and guesses.

Catalogs may not identify a sequel separately; the existing franchise fallback remains in that case. Episode naming and audio fingerprints still depend on the existing providers. No dependency or new service key was added.

## Verification

Catalog, music and video-artwork fixtures cover sequel queries, conflicting years, unrelated titles, remaster editions and live/remix identities. Focused tests and intermediate typechecks are recorded in this commit. Native UI harness: N/A for matching changes with no new interface or IPC.

## Rollback boundary

Revert this commit to restore the previous catalog routing, season/year matching, cover cache identities and music edition matching, including their regression tests and cache versions. Saved corrections are separate from these caches.
