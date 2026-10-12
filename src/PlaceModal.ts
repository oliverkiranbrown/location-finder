import { Modal, Notice, Platform, Setting } from 'obsidian';
import type { App, TFile } from 'obsidian';
import type { NominatimResult } from './geocode';
import { describePlace, osmMapUrl } from './geocode';
import { hasExistingCoordinates, writeCoordinates } from './frontmatter';
import type { PlaceLocatorSettings } from './settings';
import type PlaceLocatorPlugin from './main';

const SEARCH_DEBOUNCE_MS = 600;

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Picker modal. The search box is pre-filled with the initial query and
 * searched immediately; typed searches are debounced. The modal is always
 * shown so the user can verify the match before anything is written.
 */
export class PlaceLocatorModal extends Modal {
	private readonly plugin: PlaceLocatorPlugin;
	private readonly file: TFile;
	private readonly settings: PlaceLocatorSettings;
	private readonly initialQuery: string;

	private results: NominatimResult[] = [];
	private selectedIndex = 0;
	private searchSeq = 0;
	private debounceTimer: number | null = null;

	private inputEl!: HTMLInputElement;
	private statusEl!: HTMLElement;
	private resultsEl!: HTMLElement;

	constructor(
		app: App,
		plugin: PlaceLocatorPlugin,
		file: TFile,
		initialQuery: string,
	) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.settings = plugin.settings;
		this.initialQuery = initialQuery;
	}

	onOpen(): void {
		this.titleEl.setText('Find coordinates');

		const { contentEl } = this;
		contentEl.empty();

		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			cls: 'place-locator-input',
			attr: { placeholder: 'Search a place', spellcheck: 'false' },
		});
		this.statusEl = contentEl.createDiv({ cls: 'place-locator-status' });
		this.resultsEl = contentEl.createDiv({ cls: 'place-locator-results' });

		this.inputEl.addEventListener('input', () => this.scheduleSearch());
		this.inputEl.addEventListener('keydown', (evt: KeyboardEvent) =>
			this.onKeydown(evt),
		);

		this.inputEl.value = this.initialQuery;
		// Do not steal focus on mobile: the on-screen keyboard would cover
		// the results the moment the modal opens.
		if (!Platform.isMobile) {
			window.setTimeout(() => this.inputEl.focus(), 0);
		}
		void this.runSearch();
	}

	onClose(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.contentEl.empty();
	}

	private onKeydown(evt: KeyboardEvent): void {
		if (evt.key === 'ArrowDown') {
			evt.preventDefault();
			this.moveSelection(1);
		} else if (evt.key === 'ArrowUp') {
			evt.preventDefault();
			this.moveSelection(-1);
		} else if (evt.key === 'Enter') {
			evt.preventDefault();
			this.acceptSelected();
		}
	}

	private scheduleSearch(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			this.debounceTimer = null;
			void this.runSearch();
		}, SEARCH_DEBOUNCE_MS);
	}

	private async runSearch(): Promise<void> {
		const query = this.inputEl.value.trim();
		if (query === '') {
			this.searchSeq += 1;
			this.results = [];
			this.selectedIndex = 0;
			this.renderResults();
			this.setStatus('Type a place name to search.');
			return;
		}

		const seq = (this.searchSeq += 1);
		this.setStatus('Searching…');

		try {
			const results = await this.plugin.geocode(query);
			if (seq !== this.searchSeq) return;
			this.results = results;
			this.selectedIndex = 0;
			this.renderResults();
			this.setStatus(results.length === 0 ? 'No results' : '');
		} catch (error) {
			if (seq !== this.searchSeq) return;
			this.results = [];
			this.selectedIndex = 0;
			this.renderResults();
			this.setStatus(errorMessage(error));
		}
	}

	private setStatus(text: string): void {
		this.statusEl.setText(text);
	}

	private renderResults(): void {
		this.resultsEl.empty();

		this.results.forEach((result, index) => {
			const row = this.resultsEl.createDiv({
				cls: 'place-locator-result',
			});
			if (index === this.selectedIndex) {
				row.addClass('is-selected');
			}

			row.createDiv({
				cls: 'place-locator-primary',
				text: result.display_name,
			});

			const secondary = describePlace(result);
			if (secondary !== '') {
				row.createDiv({
					cls: 'place-locator-secondary',
					text: secondary,
				});
			}

			if (index === this.selectedIndex) {
				const url = osmMapUrl(result.lat, result.lon);
				const link = row.createEl('a', {
					cls: 'place-locator-osm',
					text: 'Open in OpenStreetMap',
					attr: { href: url, target: '_blank', rel: 'noopener' },
				});
				link.addEventListener('click', (evt) => {
					// Route the link through Obsidian's opener, which works on
					// mobile too; the click must not accept the result.
					evt.stopPropagation();
					evt.preventDefault();
					window.open(url, '_blank');
				});
			}

			row.addEventListener('click', () => this.accept(result));
		});
	}

	private moveSelection(delta: number): void {
		const count = this.results.length;
		if (count === 0) return;
		this.selectedIndex = (this.selectedIndex + delta + count) % count;
		this.renderResults();
	}

	private acceptSelected(): void {
		const result = this.results[this.selectedIndex];
		if (result === undefined) return;
		this.accept(result);
	}

	private accept(result: NominatimResult): void {
		const cache = this.app.metadataCache.getFileCache(this.file);
		if (this.settings.confirmOverwrite && hasExistingCoordinates(cache)) {
			new ConfirmModal(this.app, () => {
				void this.writeResult(result);
			}).open();
			return;
		}
		void this.writeResult(result);
	}

	private async writeResult(result: NominatimResult): Promise<void> {
		this.close();
		try {
			await writeCoordinates(this.app, this.file, result, this.settings);
			new Notice(`Set coordinates: ${result.display_name}`);
		} catch (error) {
			new Notice(`Could not write coordinates: ${errorMessage(error)}`);
		}
	}
}

/** Small confirm step shown before overwriting existing coordinates. */
class ConfirmModal extends Modal {
	private readonly onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.titleEl.setText('Overwrite existing coordinates?');
		this.contentEl.createEl('p', {
			text: 'This note already has coordinates. Replace them with the selected place?',
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText('Overwrite')
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
