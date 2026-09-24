import { Button } from "@renderer/components/ui/button"
import { useT } from "@renderer/i18n"
import { logger } from "@renderer/lib/utils"
import React from "react"

function ErrorFallback(): JSX.Element {
	const t = useT()
	return (
		<main className="flex min-h-dvh items-center justify-center bg-chrome p-6 text-body">
			<div className="w-full max-w-md space-y-4">
				<h1 className="type-hero text-strong">{t("The window could not load")}</h1>
				<p role="alert" className="type-body text-muted-foreground">
					{t("An interface error stopped this view. Reload the window to try again.")}
				</p>
				<Button autoFocus onClick={() => window.location.reload()}>
					{t("Reload window")}
				</Button>
			</div>
		</main>
	)
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
	override state = { failed: false }

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true }
	}

	override componentDidCatch(error: Error, info: React.ErrorInfo): void {
		logger.error(`Renderer failed to render: ${error}; ${info.componentStack}`)
	}

	override render(): React.ReactNode {
		return this.state.failed ? <ErrorFallback /> : this.props.children
	}
}
