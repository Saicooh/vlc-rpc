import { InfoCircledIcon } from "@radix-ui/react-icons"
import { Button } from "@renderer/components/ui/button"

interface WelcomeStepProps {
	onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps): JSX.Element {
	return (
		<div className="space-y-4">
			<h2 className="text-2xl font-bold text-center">Welcome!</h2>
			<p className="text-center text-muted-foreground">
				Let's set up VLC Discord Rich Presence so you can share what you're playing.
			</p>

			<div className="bg-muted text-muted-foreground p-4 rounded-md">
				<div className="flex">
					<InfoCircledIcon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
					<div className="ml-2">
						<p className="text-sm text-card-foreground">
							This app works by connecting to VLC's HTTP interface to get information about what
							you're playing.
						</p>
						<p className="text-sm mt-2 text-card-foreground">
							We'll need to configure VLC to enable this feature.
						</p>
					</div>
				</div>
			</div>

			<div className="pt-4">
				<Button
					onClick={onNext}
					className="w-full cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
				>
					Let's get started
				</Button>
			</div>
		</div>
	)
}
