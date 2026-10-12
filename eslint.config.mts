import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Proper nouns and brand names that keep their canonical casing.
		files: ['**/*.{ts,cts,mts,tsx}'],
		plugins: {
			obsidianmd,
		},
		rules: {
			'obsidianmd/ui/sentence-case': [
				'warn',
				{
					enforceCamelCaseLower: true,
					ignoreWords: [
						'Place',
						'Locator',
						'OpenStreetMap',
						'Nominatim',
						'User-Agent',
						'ISO',
					],
				},
			],
		},
	},
	{
		// Unit tests run under plain Node, never inside Obsidian.
		files: ['tests/**/*.ts'],
		rules: {
			'import/no-nodejs-modules': 'off',
			// node:test types describe() and it() as void | Promise<void>.
			'@typescript-eslint/no-floating-promises': 'off',
		},
	},
);
