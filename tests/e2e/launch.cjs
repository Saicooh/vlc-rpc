// Run the compiled app with isolated storage and real HTTP/RPC clients pointed at local fakes.
const { app } = require("electron")
const { join, dirname } = require("node:path")
const net = require("node:net")
const childProcess = require("node:child_process")

const root = process.env.VLC_RPC_E2E_ROOT
if (!root || !process.env.VLC_RPC_E2E_PIPE) throw new Error("Missing isolated E2E environment")
app.setPath("appData", root)
app.setPath("userData", join(root, "profile"))
app.setAppLogsPath(join(root, "logs"))

// Do not let a developer's open VLC or Syncplay affect the simulated session.
const execFile = childProcess.execFile
childProcess.execFile = function (file, ...args) {
	if (file === "tasklist.exe" || file === "pgrep") {
		setImmediate(() => args.at(-1)(null, "", ""))
		return new childProcess.ChildProcess()
	}
	return execFile.call(this, file, ...args)
}

const { IPCTransport } = require(
	join(dirname(require.resolve("@xhayper/discord-rpc")), "transport/IPC.js"),
)
IPCTransport.prototype.getSocket = () =>
	new Promise((resolve, reject) => {
		const socket = net.createConnection(process.env.VLC_RPC_E2E_PIPE)
		socket.once("error", reject)
		socket.once("connect", () => {
			socket.removeListener("error", reject)
			resolve(socket)
		})
	})

const fetchLocal = global.fetch
global.fetch = (input, options) => {
	const url = new URL(typeof input === "string" ? input : (input.url ?? input))
	if (url.hostname !== "localhost" || url.port !== process.env.VLC_RPC_E2E_PORT) {
		return Promise.reject(new Error("External requests are disabled in E2E tests"))
	}
	return fetchLocal(input, options)
}

require("../../out/main/main.js")
