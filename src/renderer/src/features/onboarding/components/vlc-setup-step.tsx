import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { useT } from "@renderer/i18n"
import type { VlcConfig } from "@shared/config/app-config"
import { XCircle } from "phosphor-react"

interface VlcSetupStepProps {
	vlcConfig: VlcConfig
	onVlcConfigChange: (config: VlcConfig) => void
	onBack: () => void
	onSubmit: () => void
	isLoading: boolean
	connectionStatus: "idle" | "testing" | "success" | "error"
	errorMessage: string | null
}

export function VlcSetupStep({
	vlcConfig,
	onVlcConfigChange,
	onBack,
	onSubmit,
	isLoading,
	connectionStatus,
	errorMessage,
}: VlcSetupStepProps): JSX.Element {
	const t = useT()
	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault()
				onSubmit()
			}}
		>
			<h2 className="type-hero text-strong">{t("Configure VLC")}</h2>
			<p className="type-body text-muted-foreground">
				{t("The app reads what you play from VLC's HTTP interface.")}
			</p>

			<div className="space-y-4">
				<div className="space-y-2">
					<label className="type-label block text-body" htmlFor="httpPort">
						{t("HTTP port")}
					</label>
					<Input
						id="httpPort"
						type="number"
						value={vlcConfig.httpPort}
						onChange={(event) =>
							onVlcConfigChange({
								...vlcConfig,
								httpPort: Number(event.target.value),
							})
						}
						min="1000"
						max="65535"
					/>
					<p className="type-caption text-muted-foreground">
						{t("Leave 9080 unless another app already uses that port.")}
					</p>
				</div>

				<div className="space-y-2">
					<label className="type-label block text-body" htmlFor="httpPassword">
						{t("HTTP password")}
					</label>
					<Input
						id="httpPassword"
						type="password"
						value={vlcConfig.httpPassword}
						onChange={(event) =>
							onVlcConfigChange({
								...vlcConfig,
								httpPassword: event.target.value,
							})
						}
						placeholder={t("Generated if you leave this empty")}
					/>
					<p className="type-caption text-muted-foreground">
						{t("This protects VLC's HTTP interface, which the app turns on for you.")}
					</p>
				</div>
			</div>

			{errorMessage && (
				<div className="flex gap-2 rounded-md bg-danger-wash p-3 text-danger-text" role="alert">
					<XCircle aria-hidden="true" className="mt-[2px] size-4 shrink-0" />
					<p className="type-body">{t(errorMessage)}</p>
				</div>
			)}

			<div className="flex justify-end gap-2 pt-4">
				<Button variant="secondary" onClick={onBack} disabled={isLoading}>
					{t("Back")}
				</Button>
				<Button type="submit" isLoading={isLoading}>
					{t(connectionStatus === "error" ? "Try again" : "Configure VLC")}
				</Button>
			</div>
		</form>
	)
}
