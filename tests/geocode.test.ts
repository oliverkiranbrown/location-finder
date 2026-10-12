import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	buildQuery,
	buildSearchUrl,
	clampMaxResults,
	coordinatesOf,
	describePlace,
	GeocodeError,
	makeUserAgent,
	NominatimClient,
	parseCountryCodes,
	RateLimiter,
} from '../src/geocode.ts';
import type {
	GeocodeRequest,
	NominatimResult,
} from '../src/geocode.ts';

function fakeRequest(
	calls: GeocodeRequest[],
	response: unknown,
	status = 200,
) {
	return async (request: GeocodeRequest) => {
		calls.push(request);
		return { status, json: response };
	};
}

describe('buildQuery', () => {
	it('returns the title when no hint is given', () => {
		assert.equal(buildQuery('Burj Khalifa'), 'Burj Khalifa');
	});

	it('appends the hint as "title, hint"', () => {
		assert.equal(buildQuery('Jamestown', 'Virginia'), 'Jamestown, Virginia');
	});

	it('trims and skips empty parts', () => {
		assert.equal(buildQuery('  Burj Khalifa  ', '  '), 'Burj Khalifa');
		assert.equal(buildQuery('', 'Dubai'), 'Dubai');
	});
});

describe('parseCountryCodes', () => {
	it('parses comma-separated codes case-insensitively', () => {
		assert.deepEqual(parseCountryCodes('us, GB '), ['us', 'gb']);
	});

	it('drops invalid entries', () => {
		assert.deepEqual(parseCountryCodes('usa, x, gb'), ['gb']);
	});
});

describe('clampMaxResults', () => {
	it('clamps to the 1-10 range', () => {
		assert.equal(clampMaxResults(0), 1);
		assert.equal(clampMaxResults(11), 10);
		assert.equal(clampMaxResults(5), 5);
		assert.equal(clampMaxResults(Number.NaN), 5);
	});
});

describe('makeUserAgent', () => {
	it('includes the plugin id and the contact', () => {
		assert.equal(
			makeUserAgent('1.2.3', 'me@example.com'),
			'PlaceLocator/1.2.3 (Obsidian community plugin); contact: me@example.com',
		);
	});

	it('omits the contact when empty', () => {
		assert.equal(
			makeUserAgent('1.0.0', '  '),
			'PlaceLocator/1.0.0 (Obsidian community plugin)',
		);
	});
});

describe('coordinatesOf', () => {
	it('maps a result to [lat, lon] strings in order', () => {
		const result: NominatimResult = {
			lat: '25.197313473227883',
			lon: '55.27439785447675',
			display_name: 'x',
		};
		assert.deepEqual(coordinatesOf(result), [
			'25.197313473227883',
			'55.27439785447675',
		]);
	});
});

describe('describePlace', () => {
	it('shows category/type and country', () => {
		const result: NominatimResult = {
			display_name: 'x',
			lat: '1',
			lon: '2',
			category: 'man_made',
			type: 'tower',
			address: { country: 'United Arab Emirates' },
		};
		assert.equal(describePlace(result), 'man_made/tower · United Arab Emirates');
	});

	it('falls back to the country code', () => {
		const result: NominatimResult = {
			display_name: 'x',
			lat: '1',
			lon: '2',
			address: { country_code: 'ae' },
		};
		assert.equal(describePlace(result), 'AE');
	});
});

describe('buildSearchUrl', () => {
	it('builds a Nominatim search url with the required params', () => {
		const url = new URL(buildSearchUrl('Burj Khalifa', { maxResults: 5 }));
		assert.equal(url.hostname, 'nominatim.openstreetmap.org');
		assert.equal(url.pathname, '/search');
		assert.equal(url.searchParams.get('q'), 'Burj Khalifa');
		assert.equal(url.searchParams.get('format'), 'jsonv2');
		assert.equal(url.searchParams.get('limit'), '5');
		assert.equal(url.searchParams.get('addressdetails'), '1');
		assert.equal(url.searchParams.has('countrycodes'), false);
	});

	it('adds countrycodes when provided', () => {
		const url = new URL(
			buildSearchUrl('x', { maxResults: 3, countryCodes: ['us', 'gb'] }),
		);
		assert.equal(url.searchParams.get('countrycodes'), 'us,gb');
	});
});

describe('NominatimClient', () => {
	it('sends the query, user agent, and parses results', async () => {
		const calls: GeocodeRequest[] = [];
		const client = new NominatimClient(
			fakeRequest(calls, [{ lat: '1', lon: '2', display_name: 'x' }]),
		);
		const results = await client.search({
			query: ' Burj Khalifa ',
			maxResults: 5,
			userAgent: 'UA',
		});
		assert.equal(results.length, 1);
		assert.equal(calls.length, 1);
		const [call] = calls;
		assert.ok(call !== undefined);
		const callUrl = new URL(call.url);
		assert.equal(callUrl.searchParams.get('q'), 'Burj Khalifa');
		assert.equal(callUrl.searchParams.get('format'), 'jsonv2');
		assert.equal(call.headers['User-Agent'], 'UA');
	});

	it('returns no results without a request for an empty query', async () => {
		const calls: GeocodeRequest[] = [];
		const client = new NominatimClient(fakeRequest(calls, []));
		const results = await client.search({
			query: '   ',
			maxResults: 5,
			userAgent: 'UA',
		});
		assert.deepEqual(results, []);
		assert.equal(calls.length, 0);
	});

	it('throws on a non-200 response', async () => {
		const client = new NominatimClient(fakeRequest([], {}, 503));
		await assert.rejects(
			client.search({ query: 'x', maxResults: 5, userAgent: 'UA' }),
			GeocodeError,
		);
	});

	it('throws on a malformed response body', async () => {
		const client = new NominatimClient(fakeRequest([], { error: 'bad' }));
		await assert.rejects(
			client.search({ query: 'x', maxResults: 5, userAgent: 'UA' }),
			/Nominatim/,
		);
	});

	it('rate-limits consecutive requests', async () => {
		const stamps: number[] = [];
		const client = new NominatimClient(
			async () => {
				stamps.push(Date.now());
				return { status: 200, json: [] };
			},
			new RateLimiter(80),
		);
		await client.search({ query: 'x', maxResults: 5, userAgent: 'UA' });
		await client.search({ query: 'y', maxResults: 5, userAgent: 'UA' });
		const [first = 0, second = 0] = stamps;
		assert.ok(second - first >= 70);
	});
});

describe('RateLimiter', () => {
	it('waits at least the minimum interval between tasks', async () => {
		const limiter = new RateLimiter(60);
		const stamps: number[] = [];
		await limiter.run(async () => {
			stamps.push(Date.now());
		});
		await limiter.run(async () => {
			stamps.push(Date.now());
		});
		const [first = 0, second = 0] = stamps;
		assert.ok(second - first >= 50);
	});

	it('runs queued tasks in order', async () => {
		const limiter = new RateLimiter(1);
		const order: number[] = [];
		await Promise.all([
			limiter.run(async () => {
				order.push(1);
			}),
			limiter.run(async () => {
				order.push(2);
			}),
			limiter.run(async () => {
				order.push(3);
			}),
		]);
		assert.deepEqual(order, [1, 2, 3]);
	});
});
