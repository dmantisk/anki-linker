# Anki Linker

Anki Linker is a desktop-only Obsidian plugin that opens Anki's Add dialog and inserts a link to the newly created card at the current cursor. It creates new cards only; it does not read, edit, or synchronize existing card contents.

## Requirements

- Obsidian 1.11.0 or later
- Anki desktop with the AnkiConnect add-on installed (add-on code **2055492159**)
- Style Settings community plugin is optional and only needed to customize the link appearance

## Install

1. Download the latest release ZIP from [GitHub Releases](https://github.com/dmantisk/anki-linker/releases).
2. Extract `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/anki-linker/`.
3. In Obsidian, enable **Anki Linker** under **Settings → Community plugins**.
4. Open **Settings → Anki Linker**, set the AnkiConnect URL if needed, and select a default deck and note type.

To build from source instead, run `npm install` and `npm run build`, then copy the three files from `dist/` into the plugin folder. TypeScript source is in `src/`.

## Create a card

Run **Create Anki card here** from the editor command palette. The plugin places a temporary marker at the cursor and opens Anki's Add dialog. When a new card is detected, the marker is replaced with a link to it. Only one card can be pending at a time; starting another request replaces the previous request.

Use the **Cancel pending Anki card** command or click the persistent waiting notice to cancel. A request also cancels after the configured timeout (15 minutes by default). A leftover `%%anki-pending:...%%` comment is safe to delete.

The plugin settings include:

- AnkiConnect URL, default deck, default note type, and tags for new notes
- Link text and an optional tag-style link appearance
- Optional copying of the current Obsidian URL, including the nearest heading
- An optional Anki note field to prefill with that URL
- Pending-card timeout

When using **Obsidian URL field**, wrap that field in an HTML link in the Anki card template, for example `<a href="{{Source}}">{{Source}}</a>` (replace `Source` with the selected field name).

## Link appearance

**Style Anki links like tags** is enabled by default and can be turned off in **Settings → Anki Linker → Link Display**. For additional control, install the optional **Style Settings** community plugin to adjust padding, border, colors, corners, and typography under **Settings → Style Settings → Anki Linker**.

Style Settings discovers options from the installed plugin stylesheet. If you update the plugin manually, replace `styles.css` in `<vault>/.obsidian/plugins/anki-linker/` with the latest release's stylesheet and reload Obsidian.

## Link format

New card links use this form:

`[Open in Anki](obsidian://anki-card?cid=<cardId>)`

Clicking the link opens Anki's browser on that card. If the marker was deleted before detection, the link is copied to the clipboard instead.

## Manual test checklist

1. Enable **Copy Obsidian URL when creating a card**, choose an **Obsidian URL field**, and run **Create Anki card here**. The URL is copied and prefilled in that field, Anki's Add dialog opens, and a marker appears.
2. Add a card in Anki. The marker becomes a working link within about two seconds.
3. Click the link. Anki's browser opens on that card.
4. Trigger the command, switch to another note, then add the card. The link still appears in the original note.
5. Trigger the command, then cancel from the notice or close Anki. The marker is removed after cancellation or timeout.
6. Toggle the tag-style appearance off and on. Confirm the link styling updates immediately.
