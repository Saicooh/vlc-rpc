import { describe, expect, it } from "vitest"
import { bluRayFolderTitle, isBluRaySource } from "./bluray"

describe("Blu-Ray source", () => {
	it("gets a movie title from a named rip, whether opened as a disc or index file", () => {
		expect(bluRayFolderTitle("bluray:///D:/The.Matrix.1999/BDMV/")).toBe("The Matrix 1999")
		expect(bluRayFolderTitle("file:///D:/The.Matrix.1999/BDMV/index.bdmv")).toBe("The Matrix 1999")
	})

	it("does not invent a title from a drive root or a product identifier", () => {
		expect(bluRayFolderTitle("bluray:///D:/")).toBeNull()
		expect(bluRayFolderTitle("bluray:///D:/UPXX-1016/BDMV/index.bdmv")).toBeNull()
	})

	it("keeps ordinary video files out of disc handling", () => {
		expect(isBluRaySource("file:///D:/The.Matrix.1999.mkv")).toBe(false)
		expect(bluRayFolderTitle("file:///D:/The.Matrix.1999.mkv")).toBeNull()
	})
})
