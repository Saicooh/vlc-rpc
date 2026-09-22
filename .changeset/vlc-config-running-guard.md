---
"vlc-rpc": patch
---

Check whether VLC is running before writing its settings file. Setup, settings, and quick repair now ask users to close VLC and retry so VLC cannot overwrite the change on exit.
