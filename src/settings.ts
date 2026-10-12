import { App, PluginSettingTab, Setting } from 'obsidian';
import type PlaceLocatorPlugin from './main';

export interface PlaceLocatorSettings {
	/** Identifying contact shown in the User-Agent (Nominatim policy). */
	contact: string;
	/** Comma-separated ISO 3166-1 alpha-2 codes, e.g. "us,gb". */
	countryCodes: string;
	/** Number of search results (1 to 10). */
	maxResults: number;
	/** Icon written when the note has no icon. */
	defaultIcon: string;
	/** Color written when the note has no color. */
	defaultColor: string;
	/** Tag added when the note is missing it. */
	tag: string;
	/** Ask before replacing existing coordinates. */
	confirmOverwrite: boolean;
	/** Show the map-pin ribbon icon. */
	showRibbon: boolean;
}

export const DEFAULT_SETTINGS: PlaceLocatorSettings = {
	contact: '',
	countryCodes: '',
	maxResults: 5,
	defaultIcon: 'landmark',
	defaultColor: 'red',
	tag: 'spot',
	confirmOverwrite: true,
	showRibbon: true,
};

export class PlaceLocatorSettingTab extends PluginSettingTab {
	plugin: PlaceLocatorPlugin;

	constructor(app: App, plugin: PlaceLocatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Contact for User-Agent')
			.setDesc(
				'Shown in the User-Agent header sent to Nominatim. Their usage policy requires an identifying contact.',
			)
			.addText((text) =>
				text
					.setPlaceholder('you@example.com')
					.setValue(this.plugin.settings.contact)
					.onChange(async (value) => {
						this.plugin.settings.contact = value;
						await this.plugin.saveSettings();
					}),
			);

		if (this.plugin.settings.contact.trim() === '') {
			this.containerEl.createEl('p', {
				cls: 'mod-warning',
				text: 'No contact set. Nominatim may reject or rate-limit requests without one.',
			});
		}

		new Setting(containerEl)
			.setName('Country bias')
			.setDesc(
				'Comma-separated ISO country codes (like us,gb) to restrict searches.',
			)
			.addText((text) =>
				text
					.setPlaceholder('Country codes, like us,gb')
					.setValue(this.plugin.settings.countryCodes)
					.onChange(async (value) => {
						this.plugin.settings.countryCodes = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Max results')
			.setDesc('Number of search results to show (1 to 10).')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.maxResults)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxResults = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default icon')
			.setDesc('Icon name written to frontmatter when the note has no icon.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.defaultIcon)
					.onChange(async (value) => {
						this.plugin.settings.defaultIcon = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default color')
			.setDesc('Color written to frontmatter when the note has no color.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.defaultColor)
					.onChange(async (value) => {
						this.plugin.settings.defaultColor = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Tag')
			.setDesc('Tag added to the note when it is missing.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.tag)
					.onChange(async (value) => {
						this.plugin.settings.tag = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Confirm overwrite')
			.setDesc('Ask before replacing coordinates that already exist.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmOverwrite)
					.onChange(async (value) => {
						this.plugin.settings.confirmOverwrite = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Show ribbon icon')
			.setDesc('Show a map-pin button in the left ribbon.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbon = value;
						await this.plugin.saveSettings();
						this.plugin.reloadRibbonIcon();
					}),
			);
	}
}
