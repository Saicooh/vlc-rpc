import { Button } from "@renderer/components/ui/button"
import { useT } from "@renderer/i18n"
import { CheckCircle } from "phosphor-react"

interface SetupCompleteStepProps {
	onBack: () => void
	onFinish: () => void
	isLoading: boolean
}

export function SetupCompleteStep({
	onBack,
	onFinish,
	isLoading,
}: SetupCompleteStepProps): JSX.Element {
	const t = useT()
	return (
		<div className="space-y-4">
			<h2 className="type-hero text-strong">{t("VLC is configured")}</h2>

			<div className="flex gap-3 rounded-md bg-ok/14 p-4">
				<CheckCircle aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-ok-text" />
				<div className="space-y-1">
					<p className="type-label text-ok-text">{t("The HTTP interface is on")}</p>
					<p className="type-body text-body">
						{t("Play a file in VLC to check that Discord picks it up.")}
					</p>
				</div>
			</div>

			<p className="type-caption text-muted-foreground">
				{t("Restart VLC if it was already running.")}
			</p>

			<div className="flex justify-end gap-2 pt-4">
				<Button variant="secondary" onClick={onBack} disabled={isLoading}>
					{t("Back")}
				</Button>
				<Button onClick={onFinish} isLoading={isLoading}>
					{t("Finish setup")}
				</Button>
			</div>
		</div>
	)
}
