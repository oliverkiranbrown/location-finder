# Place Locator

An Obsidian plugin that geocodes the active note's title with
[Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap) and writes
the coordinates into the note's YAML frontmatter, so place notes render on a
world map. It replaces the manual workflow of looking up a place, then
copying and pasting coordinates.

## Usage

1. Open a note named after a place (e.g. `Burj Khalifa.md`).
2. Run **Place Locator: Find coordinates for this note** from the command
   palette (bind a hotkey in Obsidian settings, or click the map-pin ribbon
   icon).
3. A modal opens with the search box pre-filled from the note title, and
   searches immediately. If the note has a `location_hint` frontmatter
   string, it is appended (`"Title, hint"`).
4. Press Enter to accept the preselected result, move with the arrow keys,
   or edit the query and pick another result. Esc cancels with no changes.

The modal is always shown, even with a single result, so you can verify the
match (each highlighted row links to OpenStreetMap) before anything is
written. On accept, the plugin writes:

```markdown
---
coordinates:
  - "25.197313473227883"
  - "55.27439785447675"
icon: landmark
color: red
tags:
  - spot
---
```

Existing `icon` and `color` values and existing tags are never overwritten,
unrelated frontmatter and the note body are preserved (writes go through
`processFrontMatter`), and coordinates are always full precision strings.
If the note already has coordinates, you are asked to confirm before
overwriting.

## Settings

- **Contact for User-Agent** — identifying contact sent with Nominatim
  requests (required by their usage policy; the plugin warns when empty).
- **Country bias** — comma-separated ISO country codes (e.g. `us,gb`) to
  restrict searches.
- **Max results** — number of results shown (1 to 10).
- **Default icon / Default color** — written only when missing.
- **Tag** — added to the note's tags when missing.
- **Confirm overwrite** — ask before replacing existing coordinates.
- **Show ribbon icon** — toggle the map-pin ribbon button.

## Privacy

The plugin makes network requests only to
`https://nominatim.openstreetmap.org/search`, and only when you run the
command or type in the search box. Your search text is sent to
OpenStreetMap's Nominatim service; nothing else leaves your vault. Requests
are rate-limited to one per second per the Nominatim usage policy.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build (main.js)
npm test        # unit tests (node:test, no extra dependencies)
npm run lint    # eslint
```

Manual testing: copy or symlink `main.js`, `manifest.json`, and
`styles.css` into `<Vault>/.obsidian/plugins/place-locator/`, reload
Obsidian, and enable the plugin in **Settings → Community plugins**.
