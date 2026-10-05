---
"vlc-rpc": patch
---

Keep checking VLC while artwork and metadata are being resolved, and discard results for media
that has changed or stopped. Concurrent requests now share artwork uploads and image downloads.
Independent video artwork and episode title lookups run in parallel.
The interface reuses the status it already read and requests image bytes only when the artwork
changes. Image previews have an eight-second timeout and an 8 MiB size limit.
