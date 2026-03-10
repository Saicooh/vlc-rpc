import { useStore } from "@nanostores/react"
import { useDiscordHealth } from "@renderer/features/discord/hooks/use-discord-health"
import { HomePage } from "@renderer/features/home"
import { LayoutPage } from "@renderer/features/layout"
import { FirstRunPage } from "@renderer/features/onboarding"
import { SettingsPage } from "@renderer/features/settings"
import { UpdateNotification } from "@renderer/features/updates"
import { useAppInit } from "@renderer/hooks/use-app-init"
import { Navigation } from "@renderer/shell/navigation"
import { Titlebar } from "@renderer/shell/titlebar"
import { configStore, isFirstRun } from "@renderer/stores/config.store"
import { Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

function App(): JSX.Element {
	const loading = useAppInit()
	const firstRun = useStore(isFirstRun)
	const config = useStore(configStore)

	useDiscordHealth()

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background text-foreground">
				<div className="animate-pulse flex items-center space-x-2">
					<div className="h-6 w-6 bg-primary rounded-full animate-bounce" />
					<p>Loading...</p>
				</div>
			</div>
		)
	}

	if (firstRun) {
		return <FirstRunPage />
	}

	return (
		<Router hook={useHashLocation}>
			<div className="h-screen flex flex-col bg-background text-foreground antialiased no-scrollbar overscroll-none">
				<Titlebar />

				<div className="flex-1 flex flex-col min-h-0">
					<Navigation />

					<main className="flex-1 min-h-0 overflow-hidden">
						<div className="h-full overflow-y-auto no-scrollbar overscroll-y-contain p-4">
							<Switch>
								<Route path="/" component={HomePage} />
								<Route path="/layout" component={LayoutPage} />
								<Route path="/settings" component={SettingsPage} />
								<Route>
									<div className="max-w-2xl mx-auto p-6 text-center">
										<h2 className="text-xl font-bold">404 - Page Not Found</h2>
										<p className="mt-2 text-muted-foreground">
											The page you're looking for doesn't exist.
										</p>
									</div>
								</Route>
							</Switch>
						</div>
					</main>

					<footer className="flex-shrink-0 py-2 px-4 text-center text-xs text-muted-foreground border-t border-border bg-card/30 backdrop-blur-sm">
						<p>VLC Discord RP v{config?.version || "4.0.1"}</p>
					</footer>
				</div>
			</div>

			<UpdateNotification />
		</Router>
	)
}

export default App
