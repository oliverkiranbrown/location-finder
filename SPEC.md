# Spec: Place Locator (Obsidian plugin)

## 1. Goal

A one-keystroke command that geocodes the active note's title and writes the coordinates into the note's YAML frontmatter, so the note renders on a `map.base` world map. It replaces the current manual workflow (look up the place in Google Maps, copy and paste coordinates).

Design principles:
- Fully deterministic. No LLM calls.
- Streamlined: one command, one modal, one frontmatter write.
- Runs inside Obsidian (desktop). No terminal or CLI.

## 2. Context: the note format

Place notes are created from an existing template and look like this. The plugin must produce exactly this frontmatter shape:

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
## Background

```

Rules:
- `coordinates` is a YAML list of **two quoted strings**: `[latitude, longitude]`, in that order.
- Values are written at the full precision the API returns (no rounding).
- `icon`, `color` and `tags` are used by the user's `map.base`.
- The note body is user content and must never be modified.

## 3. User flow

1. The user creates a note named after a place (e.g. `Burj Khalifa.md`) and opens it.
2. The user runs the command **"Place Locator: Find coordinates for this note"** (command palette or a hotkey the user binds themselves).
3. A modal opens. The search box is pre-filled with the note title. The plugin searches immediately.
4. Results appear as a list. The first result is preselected.
5. The user presses Enter (or clicks) to accept, or edits the query and picks another result. Esc cancels with no changes to the file.
6. On accept, the plugin writes the frontmatter and shows a notice: `Set coordinates: <display name>`.

The modal is **always** shown, even when there is only one result, so the user can verify the match before it is written.

## 4. Functional requirements

### 4.1 Command
- Register one command, id `locate-place`, name "Find coordinates for this note".
- No default hotkey (the user binds it in Obsidian settings).
- Optional ribbon icon (map-pin) that runs the same command. Setting to toggle it (default on).
- If there is no active markdown file, show a notice and do nothing.

### 4.2 Geocoding
- Provider: Nominatim (OpenStreetMap) search API.
  - `GET https://nominatim.openstreetmap.org/search`
  - Params: `q=<query>`, `format=jsonv2`, `limit=<maxResults>`, `addressdetails=1`, plus `countrycodes=<codes>` if configured.
- Use Obsidian's `requestUrl` (not `fetch`) to avoid CORS problems.
- Send a descriptive `User-Agent` header including a user-configurable contact string (Nominatim policy requires an identifying agent).
- Rate limit: at most 1 request per second. Debounce typed searches (about 600 ms after the last keystroke) and do not fire overlapping requests.
- Query construction:
  - Base query = the contents of the modal search box (initially the note title).
  - If the note frontmatter has a `location_hint` string, append it to the initial query (`"<title>, <hint>"`).
- Behaviour on failure (network error, non-200, empty result): show an inline message in the modal ("No results" or the error) and let the user edit the query and retry. Never write to the file on failure.

### 4.3 Picker modal
- Implement as a `SuggestModal` (or `Modal` with an input and list if `SuggestModal`'s input cannot be pre-filled and re-queried cleanly).
- Each row shows:
  - Primary: `display_name` from the API.
  - Secondary: place type/category and country.
- Keyboard: up/down to move, Enter to accept, Esc to cancel.
- Optional: a small "open in OpenStreetMap" action on the highlighted row (link to `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>#map=15/<lat>/<lon>`) to sanity-check the pin.

### 4.4 Frontmatter write
- Use `app.fileManager.processFrontMatter(file, fn)` so that unrelated keys and the note body are preserved.
- Set `fm.coordinates = [String(lat), String(lon)]` (strings, latitude first).
- If missing, set defaults: `fm.icon = settings.defaultIcon` (default `landmark`), `fm.color = settings.defaultColor` (default `red`), and ensure `fm.tags` is an array containing `settings.tag` (default `spot`). Do not overwrite existing `icon`, `color` or other tags; only add the tag if absent.
- If `coordinates` already exists, the modal still opens as normal. On accept, show a short confirm step ("Overwrite existing coordinates?") unless the setting `confirmOverwrite` is off (default on).
- Keep `lat`/`lon` exactly as returned by the API (they arrive as strings).

### 4.5 Settings tab
| Setting | Default | Notes |
|---|---|---|
| Contact for User-Agent | empty | Shown in the User-Agent header; plugin warns if empty |
| Country bias | empty | Comma-separated ISO codes, e.g. `us,gb` |
| Max results | 5 | 1 to 10 |
| Default icon | `landmark` | Written only if `icon` missing |
| Default color | `red` | Written only if `color` missing |
| Tag | `spot` | Added to `tags` if missing |
| Confirm overwrite | on | |
| Show ribbon icon | on | |

## 5. Non-goals (v1)
- No LLM or any AI calls.
- No scanning of note body or backlinks for disambiguation context (the editable search box and `location_hint` cover this).
- No bulk or batch geocoding.
- No creating place notes from `[[links]]` in other notes.
- No map rendering (handled by the user's `map.base`).
- No mobile-specific work (should not break on mobile, but not tested).

## 6. Technical approach
- Language: TypeScript.
- Start from the official template: `https://github.com/obsidianmd/obsidian-sample-plugin`. Clone it, rename the plugin (`manifest.json`: id `place-locator`, name "Place Locator"), and remove the sample commands and ribbon code.
- Files:
  - `main.ts`: plugin class, command registration, settings load/save.
  - `geocode.ts`: query building and Nominatim client (pure functions where possible).
  - `PlaceModal.ts`: the picker modal.
  - `frontmatter.ts`: the write logic wrapping `processFrontMatter`.
  - `settings.ts`: settings tab.
- Keep dependencies at zero beyond the template's dev tooling.
- Build with the template's esbuild setup (`npm run build`), producing `main.js`.

## 7. Testing
- Unit tests (optional but preferred) for: query building (title, title plus hint), mapping an API result to `["lat","lon"]` strings, and the frontmatter transform (existing keys preserved, tag not duplicated, defaults only when missing).
- Manual test: build, then symlink or copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/place-locator/`, enable the plugin, and verify:
  1. `Burj Khalifa` gives about `25.1972`, `55.2744`, and output matches section 2 exactly.
  2. `Jamestown` shows several results; editing the query to `Jamestown Virginia` surfaces the Virginia result.
  3. A note with a body and an embed keeps its body byte-for-byte.
  4. A note with existing coordinates triggers the overwrite confirmation.
  5. Offline or an invalid query shows an inline message and does not modify the file.
  6. Esc cancels with no changes.

## 8. Acceptance criteria
- One command or hotkey opens the picker pre-filled with the note title.
- Enter on the top result produces frontmatter identical in shape to section 2, and the note appears correctly on the user's `map.base`.
- No body content or unrelated frontmatter is ever altered.
- Nominatim usage respects the rate limit and sends a User-Agent.
- No network calls other than to Nominatim.

## 9. Possible later work (out of scope)
- Disambiguation from note context or backlinks.
- Create-and-locate from a `[[link]]` in another note.
- Alternative providers (e.g. Google, Mapbox) behind a setting.

