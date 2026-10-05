import { useStore } from "@nanostores/react"
import { Row } from "@renderer/components/ui/panel"
import { Switch } from "@renderer/components/ui/switch"
import { useT } from "@renderer/i18n"
import { configStore, saveConfig } from "@renderer/stores/config.store"
import { useId, useState } from "react"

export function LocalArtworkUploadsRow(): JSX.Element {
	const config = useStore(configStore)
	const t = useT()
	const id = useId()
	const [saving, setSaving] = useState(false)
	const [failed, setFailed] = useState(false)

	async function toggle(enabled: boolean): Promise<void> {
		setSaving(true)
		setFailed(false)
		try {
			await saveConfig("allowLocalArtworkUploads", enabled)
		} catch {
			setFailed(true)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Row
			htmlFor={id}
			label={t("Allow local image uploads")}
			description={
				<span id={`${id}-description`}>
					{t(
						"Upload embedded artwork and video frames to public image hosts for Discord. Turn off to use catalog images or the default icon. This does not delete images already uploaded.",
					)}
					{failed && (
						<span role="alert" className="block text-danger-text">
							{t("Could not save the upload setting. Try again.")}
						</span>
					)}
				</span>
			}
			control={
				<Switch
					id={id}
					aria-describedby={`${id}-description`}
					checked={config?.allowLocalArtworkUploads !== false}
					disabled={!config || saving}
					onChange={(event) => void toggle(event.target.checked)}
				/>
			}
		/>
	)
}
