---
"vlc-rpc": patch
---

Keep the in-app presence preview in sync with Discord when a slow update overlaps a pause or resume. Process presence updates in order so a late clear cannot leave the preview showing a paused state after playback resumes.
