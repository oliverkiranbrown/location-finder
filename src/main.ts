import { Notice, Plugin, requestUrl } from 'obsidian';
import type { NominatimResult } from './geocode';
import {
	buildQuery,
	makeUserAgent,
	NominatimClient,
	parseCountryCodes,
} from './geocode';
import { getLocationHint } from './frontmatter';
import { PlaceLocatorModal } from './PlaceModal';
import {
	DEFAULT_SETTINGS,
	PlaceLocatorSettingTab,
	PlaceLocatorSettings,
} from './settings';

export default class PlaceLocatorPlugin extends Plugin {
	settings!: PlaceLocatorSettings;
	private geocoder!: NominatimClient;
	private ribbonIconEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.geocoder = new NominatimClient(async (request) =>
			requestUrl({ ...request, method: 'GET', throw: false }),
		);

		this.addSettingTab(new PlaceLocatorSettingTab(this.app, this));

		this.addCommand({
			id: 'locate-place',
			name: 'Find coordinates for this note',
			callback: () => this.locatePlace(),
		});

		this.reloadRibbonIcon();
	}

	onunload(): void {
		this.ribbonIconEl?.remove();
		this.ribbonIconEl = null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PlaceLocatorSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	reloadRibbonIcon(): void {
		this.ribbonIconEl?.remove();
		this.ribbonIconEl = null;
		if (this.settings.showRibbon) {
			this.ribbonIconEl = this.addRibbonIcon(
				'map-pin',
				'Find coordinates for this note',
				() => this.locatePlace(),
			);
		}
	}

	async geocode(query: string): Promise<NominatimResult[]> {
		return this.geocoder.search({
			query,
			maxResults: this.settings.maxResults,
			countryCodes: parseCountryCodes(this.settings.countryCodes),
			userAgent: makeUserAgent(this.manifest.version, this.settings.contact),
		});
	}

	private locatePlace(): void {
		const file = this.app.workspace.getActiveFile();
		if (file === null || file.extension !== 'md') {
			new Notice('Place Locator: open a Markdown note first.');
			return;
		}

		if (this.settings.contact.trim() === '') {
			new Notice(
				'Place Locator: set a contact in plugin settings (required by the Nominatim usage policy).',
			);
		}

		const cache = this.app.metadataCache.getFileCache(file);
		const query = buildQuery(file.basename, getLocationHint(cache));
		new PlaceLocatorModal(this.app, this, file, query).open();
	}
}
