import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer as httpServer } from "node:http"
import { type Socket, createServer as ipcServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { type ElectronApplication, type Page, _electron, test as base } from "@playwright/test"
import type { AppConfig } from "@shared/config/app-config"

interface RpcMessage {
	cmd: string
	nonce?: string
	args?: { activity?: { details?: string; state?: string } }
}

export class Session {
	app!: ElectronApplication
	page!: Page
	discordOnline = true
	readonly commands: RpcMessage[] = []
	private readonly sockets = new Set<Socket>()
	private readonly pipe = `\\\\.\\pipe\\vlc-rpc-e2e-${randomUUID()}`
	private port = 0
	private root = ""
	private rawStatus = ""
	private playlist = ""
	private readonly vlc = httpServer((request, response) => {
		if (request.headers.authorization !== `Basic ${Buffer.from(":e2e").toString("base64")}`) {
			response.writeHead(401)
			response.end()
			return
		}
		response.setHeader("Content-Type", "application/json")
		response.end(request.url?.includes("playlist") ? this.playlist : this.rawStatus)
	})
	private readonly discord = ipcServer((socket) => {
		if (!this.discordOnline) {
			socket.destroy()
			return
		}
		this.sockets.add(socket)
		socket.on("close", () => this.sockets.delete(socket))
		socket.on("error", () => {})
		let buffer = Buffer.alloc(0)
		socket.on("data", (chunk) => {
			buffer = Buffer.concat([buffer, chunk])
			while (buffer.length >= 8) {
				const length = buffer.readUInt32LE(4)
				if (buffer.length < length + 8) break
				const opcode = buffer.readUInt32LE(0)
				const message = JSON.parse(buffer.subarray(8, length + 8).toString()) as RpcMessage
				buffer = buffer.subarray(length + 8)
				const reply =
					opcode === 0
						? {
								cmd: "DISPATCH",
								evt: "READY",
								data: { user: { id: "1", username: "E2E", discriminator: "0", avatar: null } },
							}
						: {
								cmd: message.cmd,
								nonce: message.nonce,
								data: { ...message.args?.activity, name: "VLC Discord RP" },
							}
				if (opcode === 1) this.commands.push(message)
				const payload = Buffer.from(JSON.stringify(reply))
				const header = Buffer.alloc(8)
				header.writeUInt32LE(1, 0)
				header.writeUInt32LE(payload.length, 4)
				socket.write(Buffer.concat([header, payload]))
			}
		})
	})

	async start(firstRun: boolean): Promise<void> {
		this.root = await mkdtemp(join(tmpdir(), "vlc-rpc-e2e-"))
		await mkdir(join(this.root, "profile"))
		await mkdir(join(this.root, "vlc"))
		await new Promise<void>((done) => this.vlc.listen(0, "localhost", done))
		const address = this.vlc.address()
		if (!address || typeof address === "string") throw new Error("Missing VLC HTTP port")
		this.port = address.port
		await new Promise<void>((done, fail) => {
			this.discord.once("error", fail)
			this.discord.listen(this.pipe, done)
		})
		const fixtureRoot = resolve("src/main/features/vlc/__fixtures__")
		this.rawStatus = await readFile(join(fixtureRoot, "video-movie.status.json"), "utf8")
		this.playlist = await readFile(join(fixtureRoot, "video-movie.playlist.json"), "utf8")
		const config: Partial<AppConfig> = {
			isFirstRun: firstRun,
			startWithSystem: false,
			allowLocalArtworkUploads: firstRun,
			vlc: { httpPort: this.port, httpPassword: "e2e", httpEnabled: true },
		}
		await writeFile(join(this.root, "profile/vlc-rpc-config.json"), JSON.stringify(config))
		await writeFile(
			join(this.root, "vlc/vlcrc"),
			`[core]\nextraintf=http\nhttp-port=${this.port}\nhttp-password=e2e\n`,
		)
		await this.launch()
	}

	private async launch(): Promise<void> {
		const env = Object.fromEntries(
			Object.entries(process.env).filter(
				(entry): entry is [string, string] =>
					entry[1] !== undefined && entry[0] !== "ELECTRON_RUN_AS_NODE",
			),
		)
		this.app = await _electron.launch({
			args: [resolve("tests/e2e/launch.cjs")],
			env: {
				...env,
				APPDATA: this.root,
				VLC_RPC_E2E_ROOT: this.root,
				VLC_RPC_E2E_PIPE: this.pipe,
				VLC_RPC_E2E_PORT: String(this.port),
			},
		})
		this.page = await this.app.firstWindow()
		await this.page.waitForLoadState("domcontentloaded")
	}

	async restart(): Promise<void> {
		await this.app.close()
		await this.launch()
	}

	playFile(uri: string): void {
		const raw = JSON.parse(this.rawStatus)
		raw.currentplid += 1
		const filename = decodeURIComponent(uri.split("/").at(-1) ?? "clip.mkv")
		raw.information.category.meta.filename = filename
		this.rawStatus = JSON.stringify(raw)
		this.playlist = JSON.stringify({
			children: [{ id: String(raw.currentplid), uri, name: filename, current: "current" }],
		})
	}

	async setVlcOnline(online: boolean): Promise<void> {
		if (online) {
			await new Promise<void>((done) => this.vlc.listen(this.port, "localhost", done))
		} else {
			this.vlc.closeAllConnections()
			await new Promise<void>((done) => this.vlc.close(() => done()))
		}
	}

	disconnectDiscord(): void {
		this.discordOnline = false
		for (const socket of this.sockets) socket.destroy()
	}

	async vlcrc(): Promise<string> {
		return readFile(join(this.root, "vlc/vlcrc"), "utf8")
	}

	async stop(): Promise<void> {
		try {
			await this.app?.close()
		} finally {
			for (const socket of this.sockets) socket.destroy()
			this.vlc.closeAllConnections()
			await Promise.all([
				new Promise<void>((done) => this.vlc.close(() => done())),
				new Promise<void>((done) => this.discord.close(() => done())),
			])
			if (
				resolve(dirname(this.root)) === resolve(tmpdir()) &&
				basename(this.root).startsWith("vlc-rpc-e2e-")
			) {
				await rm(this.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
			}
		}
	}
}

export const test = base.extend<{ session: Session; firstRun: boolean }>({
	firstRun: [false, { option: true }],
	session: async ({ firstRun }, use, testInfo) => {
		const session = new Session()
		try {
			await session.start(firstRun)
			await use(session)
		} finally {
			if (session.page && testInfo.status !== testInfo.expectedStatus) {
				await session.page.screenshot({ path: testInfo.outputPath("failure.png") }).catch(() => {})
			}
			await session.stop()
		}
	},
})

export { expect } from "@playwright/test"
