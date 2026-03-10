import { cn } from "@renderer/lib/utils"
import { Gear, House, Layout as LayoutPhosphor } from "phosphor-react"
import { Link } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

export function Navigation(): JSX.Element {
	const [location] = useHashLocation()

	return (
		<header className="sticky top-10 z-[9998] flex-shrink-0 h-14 px-4 border-b border-border flex items-center justify-center bg-card/50 text-card-foreground backdrop-blur-sm">
			<nav className="flex space-x-2">
				<NavLink to="/" active={location === "/"}>
					<House size={18} weight="fill" className="mr-1.5" />
					Home
				</NavLink>
				<NavLink to="/layout" active={location === "/layout"}>
					<LayoutPhosphor size={18} weight="fill" className="mr-1.5" />
					Layout
				</NavLink>
				<NavLink to="/settings" active={location === "/settings"}>
					<Gear size={18} weight="fill" className="mr-1.5" />
					Settings
				</NavLink>
			</nav>
		</header>
	)
}

function NavLink({
	to,
	active,
	children,
}: { to: string; active: boolean; children: React.ReactNode }): JSX.Element {
	return (
		<Link
			to={to}
			className={cn(
				"flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors",
				active
					? "bg-primary/10 text-primary"
					: "text-muted-foreground hover:text-foreground hover:bg-secondary",
			)}
		>
			{children}
		</Link>
	)
}
