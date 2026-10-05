export interface NumberedMovie {
	series: string
	number: number
}

const ROMAN_NUMBERS: Record<string, number> = {
	i: 1,
	ii: 2,
	iii: 3,
	iv: 4,
	v: 5,
	vi: 6,
	vii: 7,
	viii: 8,
	ix: 9,
	x: 10,
}

// Only explicit film markers count. A bare Roman numeral can name a TV season,
// and a bare number can belong to the title itself (Mob Psycho 100).
export function readNumberedMovie(title: string): NumberedMovie | null {
	const marker = title.match(/\b(?:the\s+)?(?:movie|film)\s+(?:part\s+)?(\d{1,2}|[ivx]+)\b/i)
	if (marker?.index === undefined || !marker[1]) return null
	const number = ROMAN_NUMBERS[marker[1].toLowerCase()] ?? Number(marker[1])
	const series = title.slice(0, marker.index).replace(/[\s:–—-]+$/g, "")
	if (!series || !Number.isInteger(number) || number <= 0) return null
	return { series, number }
}
