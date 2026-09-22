import { execFile } from "node:child_process"

/** A failed process query is unknown, not proof that VLC is closed. */
export function isVlcRunning(): Promise<boolean | null> {
	return new Promise((resolve) => {
		if (process.platform === "win32") {
			execFile(
				"tasklist.exe",
				["/FI", "IMAGENAME eq vlc.exe", "/FO", "CSV", "/NH"],
				{ timeout: 5000 },
				(error, stdout) => {
					resolve(error ? null : /^"vlc\.exe",/im.test(stdout))
				},
			)
			return
		}

		execFile("pgrep", ["-x", "vlc"], { timeout: 5000 }, (error, stdout) => {
			if (!error) resolve(stdout.trim().length > 0)
			else resolve((error as NodeJS.ErrnoException).code === "1" ? false : null)
		})
	})
}
