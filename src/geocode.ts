/**
 * Nominatim (OpenStreetMap) geocoding.
 *
 * This module has no runtime imports on purpose: its pure helpers can be
 * unit tested with plain Node, and the network client receives its request
 * function as a dependency.
 */

export interface NominatimAddress {
	country?: string;
	country_code?: string;
	[key: string]: unknown;
}

export interface NominatimResult {
	/** Latitude as returned by the API (a string). */
	lat: string;
	/** Longitude as returned by the API (a string). */
	lon: string;
	display_name: string;
	type?: string;
	category?: string;
	address?: NominatimAddress;
}

export class GeocodeError extends Error {}

/** Minimal shape of an HTTP request the client needs. */
export interface GeocodeRequest {
	url: string;
	headers: Record<string, string>;
}

export interface GeocodeResponse {
	status: number;
	json: unknown;
}

export type RequestFn = (request: GeocodeRequest) => Promise<GeocodeResponse>;

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_REQUEST_INTERVAL_MS = 1000;

/**
 * Timer reference resolved per host: `window` is undefined when this module
 * runs under Node in unit tests, so the Node timer is used there.
 */
const scheduleTimeout: (callback: () => void, ms: number) => void =
	typeof window === 'undefined' ? setTimeout : window.setTimeout;

/** Builds the initial query: "<title>, <hint>" (hint only when present). */
export function buildQuery(title: string, hint?: string | null): string {
	const trimmedTitle = title.trim();
	const trimmedHint = (hint ?? '').trim();
	if (trimmedTitle === '') return trimmedHint;
	if (trimmedHint === '') return trimmedTitle;
	return `${trimmedTitle}, ${trimmedHint}`;
}

/** Parses a comma-separated country setting into clean ISO alpha-2 codes. */
export function parseCountryCodes(raw: string): string[] {
	return raw
		.split(',')
		.map((code) => code.trim().toLowerCase())
		.filter((code) => /^[a-z]{2}$/.test(code));
}

/** Clamps the max-results setting to the 1-10 range Nominatim allows. */
export function clampMaxResults(value: number): number {
	if (!Number.isFinite(value)) return 5;
	return Math.min(10, Math.max(1, Math.round(value)));
}

/** Descriptive User-Agent; Nominatim policy requires an identifying agent. */
export function makeUserAgent(version: string, contact: string): string {
	const base = `PlaceLocator/${version} (Obsidian community plugin)`;
	const trimmedContact = contact.trim();
	if (trimmedContact === '') return base;
	return `${base}; contact: ${trimmedContact}`;
}

/** Maps an API result to the frontmatter value: [lat, lon] strings. */
export function coordinatesOf(result: NominatimResult): [string, string] {
	return [String(result.lat), String(result.lon)];
}

/** Secondary row text: place category/type and country. */
export function describePlace(result: NominatimResult): string {
	const parts: string[] = [];
	const kind = [result.category, result.type].filter(Boolean).join('/');
	if (kind !== '') parts.push(kind);
	const country =
		result.address?.country ?? result.address?.country_code?.toUpperCase();
	if (country !== undefined && country !== '') parts.push(country);
	return parts.join(' · ');
}

/** OpenStreetMap sanity-check link for a result. */
export function osmMapUrl(lat: string, lon: string): string {
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}

/** Builds the Nominatim search url with the params the spec requires. */
export function buildSearchUrl(
	query: string,
	options: { maxResults: number; countryCodes?: string[] },
): string {
	const params = new URLSearchParams({
		q: query,
		format: 'jsonv2',
		limit: String(clampMaxResults(options.maxResults)),
		addressdetails: '1',
	});
	const codes = options.countryCodes ?? [];
	if (codes.length > 0) params.set('countrycodes', codes.join(','));
	return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

/**
 * Serializes callers and keeps at least `minIntervalMs` between tasks,
 * which enforces Nominatim's one-request-per-second usage limit.
 */
export class RateLimiter {
	private lastRequestAt = 0;
	private tail: Promise<void> = Promise.resolve();
	private readonly minIntervalMs: number;

	constructor(minIntervalMs = MIN_REQUEST_INTERVAL_MS) {
		this.minIntervalMs = minIntervalMs;
	}

	run<T>(task: () => Promise<T>): Promise<T> {
		const job = this.tail.then(async () => {
			const waitMs = this.lastRequestAt + this.minIntervalMs - Date.now();
			if (waitMs > 0) {
				await new Promise<void>((resolve) => {
					scheduleTimeout(resolve, waitMs);
				});
			}
			this.lastRequestAt = Date.now();
			return task();
		});
		this.tail = job.then(
			() => undefined,
			() => undefined,
		);
		return job;
	}
}

export interface SearchOptions {
	query: string;
	maxResults: number;
	countryCodes?: string[];
	userAgent: string;
}

export class NominatimClient {
	private readonly limiter: RateLimiter;
	private readonly request: RequestFn;

	constructor(request: RequestFn, limiter = new RateLimiter()) {
		this.request = request;
		this.limiter = limiter;
	}

	async search(options: SearchOptions): Promise<NominatimResult[]> {
		const query = options.query.trim();
		if (query === '') return [];

		const url = buildSearchUrl(query, options);
		const response = await this.limiter.run(() =>
			this.request({
				url,
				headers: { 'User-Agent': options.userAgent },
			}),
		);

		if (response.status !== 200) {
			throw new GeocodeError(`Nominatim returned HTTP ${response.status}`);
		}
		if (!Array.isArray(response.json)) {
			throw new GeocodeError('Unexpected response format from Nominatim');
		}
		return response.json as NominatimResult[];
	}
}
