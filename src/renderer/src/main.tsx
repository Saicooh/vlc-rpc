import "@renderer/styles/globals.css"

import App from "@renderer/App"
import { ErrorBoundary } from "@renderer/components/error-boundary"
import { logger } from "@renderer/lib/utils"
import React from "react"
import ReactDOM from "react-dom/client"

// Configure global error handler
window.addEventListener("error", (event) => {
	logger.error(`Uncaught error: ${event.error}`)
})

window.addEventListener("unhandledrejection", (event) => {
	logger.error(`Unhandled promise rejection: ${event.reason}`)
})

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</React.StrictMode>,
)
