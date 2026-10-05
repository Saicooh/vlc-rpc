import { writeFile } from "node:fs/promises"
import { expect, test } from "./fixtures"

test.skip(process.platform !== "win32", "Published builds and this Electron harness target Windows")

test("hides a file across restart, excludes subfolders and restores visibility", async ({
	session,
}, testInfo) => {
	let page = session.page
	await expect.poll(() => session.commands.at(-1)?.args?.activity?.details).toBeTruthy()
	await expect(page.getByRole("button", { name: "Hide this file", exact: true })).toBeVisible()
	const hide = page.getByRole("button", { name: "Hide this file", exact: true })
	await hide.focus()
	await expect(hide).toBeFocused()
	await hide.press("Enter")
	await expect(page.getByRole("button", { name: "Show this file again" })).toBeVisible()
	await expect.poll(() => session.commands.at(-1)?.args?.activity).toBeUndefined()
	await expect
		.poll(() => page.evaluate(() => window.api.discord.getLastPresence()))
		.toMatchObject({ kind: "cleared", reason: "content-excluded" })
	await page.screenshot({ path: testInfo.outputPath("hidden-file.png") })
	await expect(
		page.getByText(
			"This file name carries no title, so there is nothing to file a correction under.",
		),
	).not.toBeVisible()
	await session.restart()
	page = session.page
	await expect(page.getByRole("button", { name: "Show this file again" })).toBeVisible()
	expect(await page.evaluate(() => window.api.config.get("contentExclusions"))).toHaveLength(1)
	await page.getByRole("button", { name: "Show this file again" }).click()
	await expect.poll(() => session.commands.at(-1)?.args?.activity?.details).toBeTruthy()
	session.playFile("file:///C:/Private/Lesson.mkv")
	await expect(page.getByText("C:\\Private\\Lesson.mkv", { exact: true })).toBeVisible()
	await page.getByRole("button", { name: "Exclude this folder", exact: true }).click()
	await expect(page.getByRole("button", { name: "Stop excluding this folder" })).toBeVisible()
	await session.app.evaluate(({ BrowserWindow }) =>
		BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2),
	)
	const restoreFolder = page.getByRole("button", { name: "Stop excluding this folder" })
	await restoreFolder.scrollIntoViewIfNeeded()
	await expect(restoreFolder).toBeInViewport()
	const rect = await restoreFolder.boundingBox()
	const viewport = await page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}))
	expect(rect).not.toBeNull()
	if (!rect) throw new Error("Folder control is missing")
	expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width)
	const panelRect = await page
		.getByRole("region", { name: "Discord visibility" })
		.locator(":scope > div")
		.boundingBox()
	if (!panelRect) throw new Error("Visibility panel is missing")
	expect(panelRect.x + panelRect.width).toBeLessThanOrEqual(viewport.width)
	// Electron's native capture includes the full window at non-default zoom.
	const zoomCapture = await session.app.evaluate(async ({ BrowserWindow }) => {
		const window = BrowserWindow.getAllWindows()[0]
		if (!window) throw new Error("Missing Electron window")
		return (await window.webContents.capturePage()).toPNG().toString("base64")
	})
	await writeFile(
		testInfo.outputPath("excluded-folder-zoom.png"),
		Buffer.from(zoomCapture, "base64"),
	)
	await session.app.evaluate(({ BrowserWindow }) =>
		BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1),
	)
	session.playFile("file:///C:/Private/Week%201/Lesson.mkv")
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.api.media.getMediaInfo().then((info) => info?.content_privacy?.hidden),
			),
		)
		.toBe(true)
	await expect.poll(() => session.commands.at(-1)?.args?.activity).toBeUndefined()
	session.playFile("file:///C:/Private-other/Lesson.mkv")
	await expect.poll(() => session.commands.at(-1)?.args?.activity?.details).toBeTruthy()
	await page.getByRole("link", { name: "Settings" }).click()
	await page
		.getByRole("region", { name: "Hidden content" })
		.screenshot({ path: testInfo.outputPath("saved-exclusions.png") })
	await page.getByRole("button", { name: "Remove exclusion", exact: false }).click()
	await expect(page.getByText("No files or folders are excluded.")).toBeVisible()
	await page.getByLabel("Interface language").selectOption("es")
	await expect(page.getByText("No hay archivos ni carpetas excluidos.")).toBeVisible()
	await page.screenshot({ path: testInfo.outputPath("exclusions-es.png") })
})

test.describe("First run", () => {
	test.use({ firstRun: true })
	test("configures VLC and keeps the upload choice across setup and restart", async ({
		session,
	}, testInfo) => {
		const page = session.page
		const uploads = page.getByRole("checkbox", { name: "Allow local image uploads" })
		await expect(uploads).toBeChecked()
		await page.getByText("Allow local image uploads", { exact: true }).click()
		await expect(uploads).not.toBeChecked()
		await expect(uploads).toBeEnabled()
		await uploads.focus()
		await uploads.press("Space")
		await expect(uploads).toBeChecked()
		await expect(uploads).toBeEnabled()
		await uploads.press("Space")
		await expect(uploads).not.toBeChecked()
		await expect(uploads).toBeEnabled()
		await page.screenshot({ path: testInfo.outputPath("onboarding.png") })
		await page.getByRole("button", { name: "Get started" }).click()
		// The isolated port is read through the same bridge as the settings screen.
		const vlc = await page.evaluate(() => window.api.vlc.getConfig())
		await page.getByLabel("HTTP port").fill(String(vlc.httpPort))
		await page.getByLabel("HTTP password").fill("e2e")
		await page.getByRole("button", { name: "Configure VLC" }).click()
		await expect(page.getByRole("heading", { name: "VLC is configured" })).toBeVisible()
		expect(await session.vlcrc()).toContain(`http-port=${vlc.httpPort}`)
		await page.getByRole("button", { name: "Finish setup" }).click()
		await expect(page.getByRole("link", { name: "Settings" })).toBeVisible()
		await session.restart()
		await session.page.getByRole("link", { name: "Settings" }).click()
		await expect(
			session.page.getByRole("checkbox", { name: "Allow local image uploads" }),
		).not.toBeChecked()
		await session.page.screenshot({ path: testInfo.outputPath("privacy-settings.png") })
		await session.page.getByLabel("Interface language").selectOption("es")
		await expect(
			session.page.getByRole("checkbox", { name: "Permitir subir imágenes locales" }),
		).not.toBeChecked()
		await session.page.screenshot({ path: testInfo.outputPath("privacy-settings-es.png") })
	})
})

test("recovers from VLC and Discord disconnections and publishes over RPC", async ({ session }) => {
	const page = session.page
	await expect
		.poll(() => session.commands.some((message) => message.args?.activity?.details))
		.toBe(true)
	await expect(page.getByRole("button", { name: "VLC connected", exact: true })).toBeVisible()
	await session.setVlcOnline(false)
	await expect(page.getByRole("button", { name: "VLC not open", exact: true })).toBeVisible()
	await expect.poll(() => session.commands.at(-1)?.args?.activity).toBeUndefined()
	await session.setVlcOnline(true)
	await expect(page.getByRole("button", { name: "VLC connected", exact: true })).toBeVisible()
	await expect.poll(() => session.commands.at(-1)?.args?.activity?.details).toBeTruthy()
	session.disconnectDiscord()
	await expect.poll(() => page.evaluate(() => window.api.discord.getStatus())).toBe(false)
	session.discordOnline = true
	expect(await page.evaluate(() => window.api.discord.reconnect())).toBe(true)
	await expect(page.getByRole("button", { name: "Discord connected", exact: true })).toBeVisible()
	await expect.poll(() => session.commands.at(-1)?.args?.activity?.details).toBeTruthy()
})

test("saves a correction, survives closing to the tray and restores it after restart", async ({
	session,
}) => {
	const page = session.page
	await page.getByRole("button", { name: "Correct this file" }).click()
	await page.getByLabel("Title", { exact: true }).fill("My corrected movie")
	await page.getByRole("button", { name: "Save correction" }).click()
	await expect
		.poll(() => session.commands.at(-1)?.args?.activity?.details)
		.toContain("My corrected movie")
	await page.getByRole("button", { name: "Close", exact: true }).click()
	await expect
		.poll(() =>
			session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
		)
		.toBe(false)
	expect(session.app.process().exitCode).toBeNull()
	await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
	await expect(page.getByRole("button", { name: "Edit correction" })).toBeVisible()
	await session.restart()
	await expect(session.page.getByRole("button", { name: "Edit correction" })).toBeVisible()
	await expect
		.poll(() => session.commands.at(-1)?.args?.activity?.details)
		.toContain("My corrected movie")
})
