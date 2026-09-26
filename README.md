# VLC Discord RP

[![Windows](https://img.shields.io/badge/Windows-0078d4?style=flat&logo=windows&logoColor=white)](https://github.com/Saicooh/vlc-rpc/releases)
[![Release](https://img.shields.io/github/v/release/Saicooh/vlc-rpc?style=flat)](https://github.com/Saicooh/vlc-rpc/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-green?style=flat)](LICENSE-CODE)

Show what you are playing in VLC on your Discord profile, with artwork when available. This is a fork of [VLC Discord RP](https://github.com/valentin-marquez/vlc-rpc).

| Music | Anime | Paused |
| --- | --- | --- |
| ![Music](docs/music%20detection.png) | ![Anime](docs/anime%20detection.png) | ![Paused](docs/paused%20detection.png) |

## Fork additions

- **Better anime matching:** Parses release groups, episode numbers, and subtitles from filenames, then uses AniList aliases to find the right title.
- **More video sources:** Uses TVMaze for western TV and Wikipedia images when a catalog has no poster. Resolved videos can link to their source from Discord.
- **Episode details:** Shows episode names when available, with an option to prefer Spanish titles. Optional thumbnails can come from TVMaze or a frame captured from the playing video.
- **Shared playback:** Detects Syncplay sessions and marks the Discord presence as shared.
- **More VLC media support:** Uses the real filename even when VLC shows a different title, recognizes Blu-Ray titles and chapters, and handles live radio streams.
- **Bilingual interface:** Switch between English and Spanish in Settings.

## Install and first run

Download the installer or portable build from [Releases](https://github.com/Saicooh/vlc-rpc/releases). Published builds are for 64-bit Windows 10 and 11.

You also need VLC and the Discord desktop app. In Discord, enable **Settings → Activity Privacy → Display current activity as a status message**. Rich Presence does not work through Discord in a browser.

On first run, the app helps you enable VLC's HTTP interface. **Close VLC before setup and reopen it afterward** so VLC reads the new settings. The app uses a password to connect to VLC on your own computer. If port 9080 is already in use, change it in the app's Settings while VLC is closed, then reopen VLC.

The installer can start with Windows. The portable build runs from any folder and keeps its settings in your user profile. An internet connection is needed for artwork, episode lookups, and updates; VLC playback information is read locally.

## Using the app

The app stays in the system tray when you close its window. Right click the tray icon to turn Rich Presence off or pause it temporarily.

Use **Layout** to arrange the fields on your Discord card. Music and video have separate layouts. If the app identifies something incorrectly, open **Correction** on Home to change its title or artwork, then manage saved corrections in Settings. Video also has **Retry lookup** to check the catalogs again.

The app checks for new releases. Installed copies can download an update; portable copies open the release page.

## Artwork and privacy

The app first checks local artwork and media tags, then searches public catalogs. Audio without useful tags can be identified by an acoustic fingerprint through AcoustID. Uncertain matches may keep the filename or show no cover rather than display the wrong title or image.

**Local artwork and selected video frames are uploaded to a public image host so Discord can display them.** Anyone with the resulting link can view the image while the host keeps it. The app uploads the image under a generated name, without your media filename or path. Uploaded images may expire, so a cover can disappear until you play the file again. You can use a correction with an existing web image instead of uploading local artwork.

Corrections have different scopes: a video correction follows the title parsed from its filename, tagged audio corrections apply to the album, and corrections for untagged audio follow the file. Moving or renaming an untagged file can therefore make its correction stop applying.

## Troubleshooting

- **Nothing appears on Discord:** Check that the desktop app is open and activity sharing is enabled in Discord's privacy settings.
- **The app cannot reach VLC:** Restart VLC. If that does not help, check the port in the app's Settings and VLC's `vlcrc` file.
- **A title or cover is wrong:** Save a correction. For a repeatable identification bug, [open an issue](https://github.com/Saicooh/vlc-rpc/issues) with the exact filename.
- **An uploaded cover disappeared:** Temporary image hosts can expire uploads. Playing the file again uploads its artwork again.

## Development

The app uses Electron, React, and TypeScript. Bun 1.4.2 is the package manager.

```bash
bun install
bun run dev
bun run test
bun run typecheck
bun run build:win
```

Audio fingerprinting in a local build requires an AcoustID key in `MAIN_VITE_ACOUSTID_KEY`; see [.env.example](.env.example). Without it, that lookup is skipped. See [CONTRIBUTING.md](CONTRIBUTING.md) for code conventions and [docs/CHANGESETS.md](docs/CHANGESETS.md) for changesets.

## License and support

Licensed under [AGPL-3.0](LICENSE-CODE). Report bugs and request features in [Issues](https://github.com/Saicooh/vlc-rpc/issues).
