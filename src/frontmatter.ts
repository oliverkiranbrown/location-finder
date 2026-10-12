import type { App, CachedMetadata, TFile } from 'obsidian';
import type { NominatimResult } from './geocode';
import type { PlaceLocatorSettings } from './settings';

/** Frontmatter view passed to `processFrontMatter`. */
export interface FrontMatter {
	[key: string]: unknown;
}

/**
 * Pure frontmatter transform. Writes `coordinates` as two strings
 * (latitude first, exactly as returned by the API), fills in the icon
 * and color defaults only when missing, and ensures the configured tag
 * is present without overwriting anything else.
 */
export function applyPlaceFrontmatter(
	fm: FrontMatter,
	result: NominatimResult,
	settings: PlaceLocatorSettings,
): void {
	fm['coordinates'] = [String(result.lat), String(result.lon)];

	if (fm['icon'] == null) fm['icon'] = settings.defaultIcon;
	if (fm['color'] == null) fm['color'] = settings.defaultColor;

	const tag = settings.tag.trim();
	if (tag === '') return;

	let tagList: unknown[];
	if (typeof fm['tags'] === 'string') {
		const single = fm['tags'].trim();
		tagList = single === '' ? [] : [single];
	} else if (Array.isArray(fm['tags'])) {
		tagList = fm['tags'];
	} else {
		tagList = [];
	}
	if (!tagList.includes(tag)) {
		fm['tags'] = [...tagList, tag];
	}
}

/** Reads the optional `location_hint` from a note's cached frontmatter. */
export function getLocationHint(
	cache: CachedMetadata | null,
): string | undefined {
	const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
	const hint = frontmatter?.['location_hint'];
	return typeof hint === 'string' ? hint : undefined;
}

/** Whether the note already has a `coordinates` list. */
export function hasExistingCoordinates(
	cache: CachedMetadata | null,
): boolean {
	const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
	return Array.isArray(frontmatter?.['coordinates']);
}

/**
 * Writes the place data via `processFrontMatter` so unrelated keys and
 * the note body are preserved byte-for-byte.
 */
export async function writeCoordinates(
	app: App,
	file: TFile,
	result: NominatimResult,
	settings: PlaceLocatorSettings,
): Promise<void> {
	await app.fileManager.processFrontMatter(
		file,
		(fm: Record<string, unknown>) => {
			applyPlaceFrontmatter(fm, result, settings);
		},
	);
}
