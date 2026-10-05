# Numbered anime movie detection

Bug-fix evidence, 2026-10-05.

The reported filename was `[FS] Mahou Shoujo Madoka Magica the Movie III - Rebellion (BD 1920x1080 x264 AAC)[35F2E72D]`. The filename library truncated the technical block at its resolution and left `(BD` in the title. AniList also returns no results for the complete cleaned name; the franchise search returns the TV series and films 1–4 together.

The parser removes complete parentheses beginning with technical release markers before calling the library, preserves the movie year and meaningful title parentheses, and removes any leftover video extension. Explicit numbered films use movie parsing so `Movie Part 3` cannot become episode 3. Explicit S/E markers still take precedence.

The shared film marker reads `Movie`/`Film`, optional `the`/`Part`, Arabic numbers and Roman I–X. Matching requires a movie entry with an alias naming the same number and a franchise name passing the existing 0.92 identity threshold. A missing match gets one additional franchise query. Catalog identity and AniList artwork use the same scorer. A failed fallback receives the transient provider-error cache lifetime. Catalog cache version 3 invalidates earlier misses and guesses; saved manual corrections remain in their separate store.

The normalized fixture `src/main/features/catalog/__fixtures__/anilist-madoka-candidates.json` was captured from AniList on 2026-10-05 using the franchise query `Mahou Shoujo Madoka Magica`. It includes the original series (9756), Rebellion (11981), and movies 1, 2 and 4 (11977, 11979 and 133007).

## Verification

| Check | Command / scenario | Result |
| --- | --- | --- |
| Focused behavior | `bun run test src/main/features/catalog src/main/features/cover/cover.video.test.ts` | 157 tests, 8 files passed |
| Shared checkout | `bun run test` | 944 tests, 64 files passed |
| Types and bundle | `bun run build` | Node, renderer and E2E types passed; Electron bundles built |
| Style | `bun run lint:check`, `git diff --check` | Passed |
| Live provider boundary | `bun --tsconfig-override tsconfig.node.json -`, stdin harness using production `Resolver`, `AniListProvider` and `VideoResolver` with an in-memory cache and stubbed Electron logger | Exact reported filename resolved to movie 11981 in two searches; repeat catalog lookup used the cache; independent artwork lookup returned the same title, source and poster |

Regressions cover the reported name with and without `.mkv`, preserved year and title parentheses, numeric/Roman film aliases, rejection of the TV series and wrong film numbers, unrelated franchises, fallback request limits, transient failure handling and old cache versions. The live provider response identified `Mahou Shoujo Madoka☆Magica: Hangyaku no Monogatari`, with source `https://anilist.co/anime/11981` and poster `https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b11981-koz1IoISs3eU.jpg`.

Native UI harness: N/A for this fix because there is no interface or IPC change. The live harness exercises parsing, provider search, catalog identity, cache reuse and artwork resolution. Provider availability and the first five search results remain external constraints.

## Rollback boundary

Remove `catalog.movie.ts`, its imports and numbered-film branches in `catalog.parser.ts`, `catalog.scorer.ts`, `catalog.resolver.ts` and `catalog.anilist.ts`, the technical-parenthesis/leftover-extension parser cleanup, and the associated regressions in their test files. Remove the Madoka fixture and `.changeset/numbered-anime-movies.md`. Revert only the version-3 bump in `catalog.cache.ts` and its version-2 regression in `catalog.cache.test.ts`. Preserve the earlier automatic season detection, exclusions and independent performance/upload settings changes in shared files. This fix is grouped with its regression tests, fixture and changeset.
