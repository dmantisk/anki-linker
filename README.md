# Anki Linker

Anki Linker creates a new Anki card from the current Obsidian note and inserts a link to that card at the command location. It only creates new cards; it does not synchronize, read, or edit existing card contents.

## Install

1. Install dependencies and build with `npm install` followed by `npm run build`.
2. Copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into `<vault>/.obsidian/plugins/anki-linker/`.
3. Enable **Anki Linker** in Obsidian's Community Plugins settings.
4. Configure the AnkiConnect URL, default deck, and default note type in the plugin settings. Enable **Copy Obsidian URL when creating a card** if you want the note location copied automatically.

The TypeScript source is kept in `src/`. Run `npm run build` to generate the complete installable plugin files in `dist/`.

Anki must be running with the AnkiConnect add-on installed. AnkiConnect's add-on code is **2055492159**.

## Commands

- **Create Anki card here** — opens Anki's Add dialog and inserts the card link when a new card is detected. If **Copy Obsidian URL when creating a card** is enabled, it also copies a link to the current note location.
- **Cancel pending Anki card** — cancels the active wait and removes its placeholder.

Commands are available from the editor command palette and do not have default hotkeys. The persistent waiting notice can also be clicked to cancel.

## Link format

New card links use this form:

`[Open in Anki](obsidian://anki-card?cid=<cardId>)`

Clicking the link opens Anki's browser for that card. If the placeholder was removed before the card was detected, the link is copied to the clipboard instead.

A leftover `%%anki-pending:...%%` comment is safe to delete.

## Manual test checklist

1. Enable **Copy Obsidian URL when creating a card**, then run **Create Anki card here**: the URL is on the clipboard, Anki's Add dialog opens, and a placeholder appears.
2. Add a card in Anki: the placeholder becomes a working link within about 2 seconds.
3. Click the link: Anki's browser opens on that card.
4. Trigger the command, then switch to another note before adding the card: the link still lands in the original note.
5. Trigger the command, then close Anki or click the waiting notice: the placeholder is removed.
