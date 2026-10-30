---
"vlc-rpc": patch
---

Discord Rich Presence now recovers more reliably after Discord restarts. The app keeps retrying every five seconds instead of giving up after ten attempts, no longer opens overlapping connections while one is still logging in, and keeps a working connection when Discord refuses a single activity instead of reconnecting on every update.
