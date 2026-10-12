import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPlaceFrontmatter } from '../src/frontmatter.ts';
import type { NominatimResult } from '../src/geocode.ts';
import type { PlaceLocatorSettings } from '../src/settings.ts';

const settings: PlaceLocatorSettings = {
	contact: '',
	countryCodes: '',
	maxResults: 5,
	defaultIcon: 'landmark',
	defaultColor: 'red',
	tag: 'spot',
	confirmOverwrite: true,
	showRibbon: true,
};

const place: NominatimResult = {
	lat: '25.197313473227883',
	lon: '55.27439785447675',
	display_name: 'Burj Khalifa, Dubai, United Arab Emirates',
	type: 'yes',
	category: 'man_made',
};

describe('applyPlaceFrontmatter', () => {
	it('fills empty frontmatter with coordinates and defaults', () => {
		const fm: Record<string, unknown> = {};
		applyPlaceFrontmatter(fm, place, settings);
		assert.deepEqual(fm['coordinates'], [
			'25.197313473227883',
			'55.27439785447675',
		]);
		assert.equal(fm['icon'], 'landmark');
		assert.equal(fm['color'], 'red');
		assert.deepEqual(fm['tags'], ['spot']);
	});

	it('writes coordinates as strings even if the API returns numbers', () => {
		const fm: Record<string, unknown> = {};
		const numeric = {
			...place,
			lat: 12.34,
			lon: 56.78,
		} as unknown as NominatimResult;
		applyPlaceFrontmatter(fm, numeric, settings);
		assert.deepEqual(fm['coordinates'], ['12.34', '56.78']);
	});

	it('keeps existing icon, color and unrelated keys', () => {
		const fm: Record<string, unknown> = {
			icon: 'building',
			color: 'blue',
			custom: 'keep me',
		};
		applyPlaceFrontmatter(fm, place, settings);
		assert.equal(fm['icon'], 'building');
		assert.equal(fm['color'], 'blue');
		assert.equal(fm['custom'], 'keep me');
	});

	it('does not duplicate an existing tag', () => {
		const fm: Record<string, unknown> = { tags: ['city', 'spot'] };
		applyPlaceFrontmatter(fm, place, settings);
		assert.deepEqual(fm['tags'], ['city', 'spot']);
	});

	it('appends the tag when missing', () => {
		const fm: Record<string, unknown> = { tags: ['city'] };
		applyPlaceFrontmatter(fm, place, settings);
		assert.deepEqual(fm['tags'], ['city', 'spot']);
	});

	it('converts a single string tag into a list', () => {
		const fm: Record<string, unknown> = { tags: 'city' };
		applyPlaceFrontmatter(fm, place, settings);
		assert.deepEqual(fm['tags'], ['city', 'spot']);
	});

	it('overwrites existing coordinates', () => {
		const fm: Record<string, unknown> = { coordinates: ['0', '0'] };
		applyPlaceFrontmatter(fm, place, settings);
		assert.deepEqual(fm['coordinates'], [
			'25.197313473227883',
			'55.27439785447675',
		]);
	});

	it('leaves tags alone when the tag setting is empty', () => {
		const fm: Record<string, unknown> = { tags: 'city' };
		applyPlaceFrontmatter(fm, place, { ...settings, tag: '' });
		assert.equal(fm['tags'], 'city');
	});
});
