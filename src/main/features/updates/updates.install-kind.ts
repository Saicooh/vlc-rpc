import { join } from "node:path"

/**
 * How this copy of the app got onto the machine, which decides whether an
 * update can install itself.
 */
export type InstallKind =
	| { kind: "installed" }
	| { kind: "portable"; reason: "portable-launcher" }
	| { kind: "unknown"; reason: "no-uninstaller" }

export interface InstallProbe {
	portableLauncher: boolean
	uninstallerPresent: boolean
}

/** electron-builder names it after the product, next to the executable. */
const UNINSTALLER_FILENAME = "Uninstall VLC Discord RP.exe"

export function uninstallerPath(resourcesPath: string): string {
	return join(resourcesPath, "..", UNINSTALLER_FILENAME)
}

/**
 * Both signals are facts the build produces, not guesses about the path: the
 * portable stub exports PORTABLE_EXECUTABLE_FILE before it starts us, and the
 * NSIS installer writes the uninstaller into the directory it installed to.
 */
export function probeInstall(
	env: Readonly<Record<string, string | undefined>>,
	resourcesPath: string,
	exists: (path: string) => boolean,
): InstallProbe {
	const launcher = env.PORTABLE_EXECUTABLE_FILE

	return {
		portableLauncher: launcher !== undefined && launcher.length > 0,
		uninstallerPresent: exists(uninstallerPath(resourcesPath)),
	}
}

/**
 * When neither signal exists, report uncertainty and use the manual update
 * path. A missing uninstaller must not turn into permission to run an installer.
 */
export function detectInstallKind(probe: InstallProbe): InstallKind {
	if (probe.portableLauncher) {
		return { kind: "portable", reason: "portable-launcher" }
	}

	if (probe.uninstallerPresent) {
		return { kind: "installed" }
	}

	return { kind: "unknown", reason: "no-uninstaller" }
}
