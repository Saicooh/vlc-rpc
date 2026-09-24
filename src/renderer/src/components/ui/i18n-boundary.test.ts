import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"
import { Button } from "./button"
import { Input } from "./input"
import { Row } from "./panel"

describe("base components preserve caller content", () => {
	it("does not translate media titles or user supplied labels", () => {
		const row = renderToStaticMarkup(
			createElement(Row, { kind: "value", label: "Title", value: "Home" }),
		)
		const button = renderToStaticMarkup(createElement(Button, { "aria-label": "Clear" }, "Clear"))
		const badge = renderToStaticMarkup(createElement(Badge, null, "Main"))
		const input = renderToStaticMarkup(createElement(Input, { placeholder: "Home" }))
		expect(row).toContain("Home")
		expect(button).toContain('aria-label="Clear"')
		expect(button).toContain(">Clear</span>")
		expect(badge).toContain(">Main</span>")
		expect(input).toContain('placeholder="Home"')
	})
})
