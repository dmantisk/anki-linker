"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AnkiLinkerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/ankiconnect.ts
var import_obsidian = require("obsidian");
var ANKICONNECT_VERSION = 6;
var ANKI_UNREACHABLE_MESSAGE = "Can't reach Anki. Is it running with AnkiConnect installed?";
var AnkiConnectError = class extends Error {
};
var AnkiConnect = class {
  constructor(url) {
    this.url = url;
  }
  async deckNames() {
    const result = await this.request("deckNames", {});
    return this.stringArray(result, "deckNames");
  }
  async modelNames() {
    const result = await this.request("modelNames", {});
    return this.stringArray(result, "modelNames");
  }
  async modelFieldNames(modelName) {
    const result = await this.request("modelFieldNames", { modelName });
    return this.stringArray(result, "modelFieldNames");
  }
  async findCards(query) {
    const result = await this.request("findCards", { query });
    if (!Array.isArray(result) || !result.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 0)) {
      throw new Error("AnkiConnect returned an invalid card ID list.");
    }
    return result;
  }
  async guiAddCards(note) {
    return this.request("guiAddCards", { note });
  }
  async guiBrowse(query) {
    return this.request("guiBrowse", { query });
  }
  async request(action, params) {
    const response = await (0, import_obsidian.requestUrl)({
      url: this.url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: ANKICONNECT_VERSION, params })
    });
    const payload = response.json;
    if (payload.error !== null) {
      throw new AnkiConnectError(payload.error || `AnkiConnect action "${action}" failed.`);
    }
    return payload.result;
  }
  stringArray(value, action) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error(`AnkiConnect returned an invalid result for ${action}.`);
    }
    return value;
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  ankiConnectUrl: "http://127.0.0.1:8765",
  deckName: "",
  modelName: "",
  tags: "",
  linkText: "Open in Anki",
  copyObsidianUrl: false,
  obsidianUrlField: "",
  includeNearestHeading: true,
  timeoutMinutes: 15
};
var AnkiLinkerSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.decks = [];
    this.models = [];
    this.modelFields = [];
    this.fieldsModelName = "";
    this.loaded = false;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const connectionGroup = this.createSection(containerEl, "Connection");
    new import_obsidian2.Setting(connectionGroup).setName("AnkiConnect URL").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.ankiConnectUrl).setValue(this.plugin.settings.ankiConnectUrl).onChange(async (value) => {
        this.plugin.settings.ankiConnectUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(connectionGroup).setName("Refresh from Anki").setDesc("Load available decks and note types from Anki.").addButton(
      (button) => button.setButtonText("Refresh from Anki").onClick(async () => {
        await this.refreshOptions(true);
      })
    );
    const cardCreationGroup = this.createSection(containerEl, "Card Creation");
    new import_obsidian2.Setting(cardCreationGroup).setName("Default deck").setDesc("Choose the deck used when opening Anki's Add dialog.").addDropdown((dropdown) => {
      dropdown.addOption("", "Select a deck");
      this.addStoredOption(dropdown, this.plugin.settings.deckName, this.decks);
      for (const deck of this.decks) dropdown.addOption(deck, deck);
      dropdown.setValue(this.plugin.settings.deckName).onChange(async (value) => {
        this.plugin.settings.deckName = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(cardCreationGroup).setName("Default note type").setDesc("Choose the note type used when opening Anki's Add dialog.").addDropdown((dropdown) => {
      dropdown.addOption("", "Select a note type");
      this.addStoredOption(dropdown, this.plugin.settings.modelName, this.models);
      for (const model of this.models) dropdown.addOption(model, model);
      dropdown.setValue(this.plugin.settings.modelName).onChange(async (value) => {
        this.plugin.settings.modelName = value;
        this.plugin.settings.obsidianUrlField = "";
        this.modelFields = [];
        this.fieldsModelName = "";
        await this.plugin.saveSettings();
        this.display();
        if (value) void this.refreshModelFields(value);
      });
    });
    new import_obsidian2.Setting(cardCreationGroup).setName("Tags to add").setDesc("Comma-separated tags applied to each new note.").addText(
      (text) => text.setPlaceholder("optional, tags").setValue(this.plugin.settings.tags).onChange(async (value) => {
        this.plugin.settings.tags = value;
        await this.plugin.saveSettings();
      })
    );
    const urlGroup = this.createSection(containerEl, "URL Handling");
    new import_obsidian2.Setting(urlGroup).setName("Copy Obsidian URL when creating a card").setDesc("Copy the current note location and optionally add it to an Anki field.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.copyObsidianUrl).onChange(async (value) => {
        this.plugin.settings.copyObsidianUrl = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.copyObsidianUrl) {
      new import_obsidian2.Setting(urlGroup).setName("Obsidian URL field").setDesc("Choose the Anki note field to prefill with the copied URL.").addDropdown((dropdown) => {
        dropdown.addOption("", "Don't add URL to a field");
        this.addStoredOption(
          dropdown,
          this.plugin.settings.obsidianUrlField,
          this.modelFields
        );
        for (const field of this.modelFields) dropdown.addOption(field, field);
        dropdown.setValue(this.plugin.settings.obsidianUrlField).onChange(async (value) => {
          this.plugin.settings.obsidianUrlField = value;
          await this.plugin.saveSettings();
        });
        if (!this.plugin.settings.modelName || this.fieldsModelName !== this.plugin.settings.modelName) {
          dropdown.selectEl.disabled = true;
        }
      });
    }
    new import_obsidian2.Setting(urlGroup).setName("Include nearest heading in copied URL").setDesc("Append the heading above the cursor to copied Obsidian URLs.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.includeNearestHeading).onChange(async (value) => {
        this.plugin.settings.includeNearestHeading = value;
        await this.plugin.saveSettings();
      })
    );
    const linkDisplayGroup = this.createSection(containerEl, "Link Display");
    new import_obsidian2.Setting(linkDisplayGroup).setName("Link text").setDesc("Text displayed for the link inserted into the note.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.linkText).setValue(this.plugin.settings.linkText).onChange(async (value) => {
        this.plugin.settings.linkText = value;
        await this.plugin.saveSettings();
      })
    );
    const behaviorGroup = this.createSection(containerEl, "Behavior");
    new import_obsidian2.Setting(behaviorGroup).setName("Timeout in minutes").setDesc("Cancel a pending card if no new card is detected by this time.").addText((text) => {
      text.inputEl.setAttribute("type", "number");
      text.inputEl.setAttribute("min", "1");
      text.inputEl.setAttribute("step", "1");
      text.setPlaceholder(String(DEFAULT_SETTINGS.timeoutMinutes)).setValue(String(this.plugin.settings.timeoutMinutes)).onChange(async (value) => {
        if (value.trim() === "") return;
        const timeout = Number(value);
        if (!Number.isFinite(timeout) || timeout <= 0) {
          new import_obsidian2.Notice("Timeout must be a positive number of minutes.");
          return;
        }
        this.plugin.settings.timeoutMinutes = timeout;
        await this.plugin.saveSettings();
      });
    });
    if (!this.loaded) {
      this.loaded = true;
      void this.refreshOptions(false);
    }
  }
  hide() {
    this.loaded = false;
  }
  createSection(containerEl, title) {
    containerEl.createEl("h3", { text: title, cls: "anki-linker-section-title" });
    return containerEl.createDiv({ cls: "anki-linker-settings-group" });
  }
  async refreshOptions(showSuccess) {
    try {
      const anki = new AnkiConnect(this.plugin.settings.ankiConnectUrl);
      [this.decks, this.models] = await Promise.all([anki.deckNames(), anki.modelNames()]);
      const selectedModel = this.plugin.settings.modelName;
      if (selectedModel && this.models.includes(selectedModel)) {
        this.modelFields = await anki.modelFieldNames(selectedModel);
        this.fieldsModelName = selectedModel;
        if (this.plugin.settings.obsidianUrlField && !this.modelFields.includes(this.plugin.settings.obsidianUrlField)) {
          this.plugin.settings.obsidianUrlField = "";
          await this.plugin.saveSettings();
        }
      } else {
        this.modelFields = [];
        this.fieldsModelName = "";
      }
      if (showSuccess) new import_obsidian2.Notice("Anki decks and note types refreshed.");
      this.display();
    } catch (error) {
      console.error("Failed to refresh Anki settings.", error);
      this.plugin.reportAnkiError(error);
    }
  }
  async refreshModelFields(modelName) {
    try {
      const fields = await new AnkiConnect(
        this.plugin.settings.ankiConnectUrl
      ).modelFieldNames(modelName);
      if (this.plugin.settings.modelName !== modelName) return;
      this.modelFields = fields;
      this.fieldsModelName = modelName;
      if (this.plugin.settings.obsidianUrlField && !fields.includes(this.plugin.settings.obsidianUrlField)) {
        this.plugin.settings.obsidianUrlField = "";
        await this.plugin.saveSettings();
      }
      this.display();
    } catch (error) {
      console.error(`Failed to load fields for Anki note type "${modelName}".`, error);
      this.plugin.reportAnkiError(error);
    }
  }
  addStoredOption(dropdown, value, options) {
    if (value && !options.includes(value)) dropdown.addOption(value, value);
  }
};

// src/main.ts
var NEW_CARD_QUERY = "added:2";
var AnkiLinkerPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.pendingCard = null;
    this.triggerVersion = 0;
  }
  async onload() {
    const saved = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...saved != null ? saved : {} };
    this.addSettingTab(new AnkiLinkerSettingTab(this.app, this));
    this.addCommand({
      id: "create-anki-card",
      name: "Create Anki card here",
      editorCallback: (editor, view) => {
        const markdownView = view instanceof import_obsidian3.MarkdownView ? view : this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
        if (!view.file || !markdownView || markdownView.file !== view.file) {
          new import_obsidian3.Notice("Open a note before creating an Anki card.");
          return;
        }
        void this.createCard(editor, markdownView, view.file);
      }
    });
    this.addCommand({
      id: "cancel-pending-anki-card",
      name: "Cancel pending Anki card",
      callback: () => {
        this.triggerVersion++;
        if (!this.pendingCard) {
          new import_obsidian3.Notice("There is no pending Anki card.");
          return;
        }
        void this.endPendingCard(this.pendingCard, "cancel", true);
      }
    });
    this.registerObsidianProtocolHandler("anki-card", async (params) => {
      const cardId = params.cid;
      const noteId = params.nid;
      if (cardId !== void 0 && /^\d+$/.test(cardId)) {
        await this.browseInAnki(`cid:${cardId}`);
        return;
      }
      if (noteId !== void 0 && /^\d+$/.test(noteId)) {
        await this.browseInAnki(`nid:${noteId}`);
        return;
      }
      new import_obsidian3.Notice("Invalid Anki card link. Expected a numeric cid or nid.");
    });
  }
  onunload() {
    this.triggerVersion++;
    if (this.pendingCard) {
      void this.endPendingCard(this.pendingCard, "cancel", false);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  reportAnkiError(error) {
    new import_obsidian3.Notice(
      error instanceof AnkiConnectError ? `Anki: ${error.message}` : ANKI_UNREACHABLE_MESSAGE
    );
  }
  async createCard(editor, view, file) {
    const triggerVersion = ++this.triggerVersion;
    await this.cancelActivePendingCard();
    if (triggerVersion !== this.triggerVersion) return;
    if (!this.settings.deckName || !this.settings.modelName) {
      new import_obsidian3.Notice("Choose a default Anki deck and note type in the plugin settings first.");
      return;
    }
    const obsidianUrl = this.settings.copyObsidianUrl ? this.getObsidianUrl(file, editor) : null;
    if (obsidianUrl) await this.copyObsidianUrl(obsidianUrl);
    if (triggerVersion !== this.triggerVersion) return;
    const placeholder = `%%anki-pending:${crypto.randomUUID()}%%`;
    const insertionPoint = editor.getCursor("to");
    editor.replaceRange(placeholder, insertionPoint);
    const placeholderSave = view.save();
    const notice = new import_obsidian3.Notice("Waiting for Anki card\u2026 click to cancel", 0);
    notice.noticeEl.style.cursor = "pointer";
    notice.noticeEl.setAttribute("role", "button");
    notice.noticeEl.tabIndex = 0;
    const pending = {
      file,
      placeholderSave,
      placeholder,
      snapshotId: 0,
      failures: 0,
      polling: false,
      intervalId: null,
      timeoutId: null,
      notice
    };
    this.pendingCard = pending;
    notice.noticeEl.addEventListener("click", () => {
      if (this.pendingCard === pending) void this.endPendingCard(pending, "cancel", true);
    });
    notice.noticeEl.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && this.pendingCard === pending) {
        event.preventDefault();
        void this.endPendingCard(pending, "cancel", true);
      }
    });
    pending.timeoutId = window.setTimeout(
      () => void this.endPendingCard(pending, "timeout", true),
      this.settings.timeoutMinutes * 60 * 1e3
    );
    try {
      await pending.placeholderSave;
      if (this.pendingCard !== pending) return;
      const anki = this.createAnkiConnect();
      const existingCards = await anki.findCards(NEW_CARD_QUERY);
      if (this.pendingCard !== pending) return;
      pending.snapshotId = existingCards.length === 0 ? 0 : Math.max(...existingCards);
      const fieldNames = await anki.modelFieldNames(this.settings.modelName);
      if (this.pendingCard !== pending) return;
      const fields = {};
      for (const fieldName of fieldNames) fields[fieldName] = "";
      if (obsidianUrl && this.settings.obsidianUrlField) {
        if (fieldNames.includes(this.settings.obsidianUrlField)) {
          fields[this.settings.obsidianUrlField] = obsidianUrl;
        } else {
          new import_obsidian3.Notice(
            `The selected URL field "${this.settings.obsidianUrlField}" isn't available in the selected note type.`
          );
        }
      }
      const tags = this.settings.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
      await anki.guiAddCards({
        deckName: this.settings.deckName,
        modelName: this.settings.modelName,
        fields,
        tags
      });
      if (this.pendingCard !== pending) return;
      pending.intervalId = window.setInterval(() => {
        void this.pollForCard(pending);
      }, 2e3);
    } catch (error) {
      console.error("Failed to start Anki card creation.", error);
      if (this.pendingCard === pending) {
        await this.endPendingCard(pending, "cancel", false);
        this.reportAnkiError(error);
      }
    }
  }
  async pollForCard(pending) {
    if (this.pendingCard !== pending || pending.polling) return;
    pending.polling = true;
    try {
      const cardIds = await this.createAnkiConnect().findCards(NEW_CARD_QUERY);
      if (this.pendingCard !== pending) return;
      pending.failures = 0;
      const newCardIds = cardIds.filter((cardId) => cardId > pending.snapshotId);
      if (newCardIds.length > 0) {
        await this.completePendingCard(pending, Math.min(...newCardIds));
      }
    } catch (error) {
      console.error("Failed to poll Anki for the new card.", error);
      if (this.pendingCard !== pending) return;
      pending.failures++;
      if (pending.failures >= 5) {
        await this.endPendingCard(pending, "cancel", false);
        this.reportAnkiError(error);
      }
    } finally {
      pending.polling = false;
    }
  }
  async completePendingCard(pending, cardId) {
    if (this.pendingCard !== pending) return;
    this.clearPendingTimers(pending);
    pending.notice.hide();
    this.pendingCard = null;
    const link = `[${this.settings.linkText || DEFAULT_SETTINGS.linkText}](obsidian://anki-card?cid=${cardId})`;
    try {
      const replaced = await this.replacePlaceholder(pending, link);
      if (replaced) return;
      await navigator.clipboard.writeText(link);
      new import_obsidian3.Notice("The placeholder was removed. The Anki link was copied to the clipboard.");
    } catch (error) {
      console.error("Failed to insert the Anki link into the note.", error);
      try {
        await this.removePlaceholder(pending);
      } catch (cleanupError) {
        console.error("Failed to remove the pending-card placeholder.", cleanupError);
      }
      try {
        await navigator.clipboard.writeText(link);
        new import_obsidian3.Notice("Couldn't update the original note. The Anki link was copied to the clipboard.");
      } catch (clipboardError) {
        console.error("Failed to copy the Anki link.", clipboardError);
        new import_obsidian3.Notice("Couldn't update the original note or copy the Anki link.");
      }
    }
  }
  async endPendingCard(pending, reason, showNotice) {
    if (this.pendingCard !== pending) return;
    this.pendingCard = null;
    this.clearPendingTimers(pending);
    pending.notice.hide();
    try {
      await pending.placeholderSave;
    } catch (error) {
      console.error("Failed to save the pending-card placeholder before cleanup.", error);
    }
    try {
      await this.removePlaceholder(pending);
    } catch (error) {
      console.error("Failed to remove the pending-card placeholder.", error);
      new import_obsidian3.Notice("Couldn't remove the pending-card placeholder from the note.");
    }
    if (!showNotice) return;
    if (reason === "cancel") new import_obsidian3.Notice("Pending Anki card canceled.");
    if (reason === "timeout") new import_obsidian3.Notice("Timed out waiting for an Anki card.");
  }
  async cancelActivePendingCard() {
    if (this.pendingCard) {
      await this.endPendingCard(this.pendingCard, "cancel", false);
    }
  }
  clearPendingTimers(pending) {
    if (pending.intervalId !== null) {
      window.clearInterval(pending.intervalId);
      pending.intervalId = null;
    }
    if (pending.timeoutId !== null) {
      window.clearTimeout(pending.timeoutId);
      pending.timeoutId = null;
    }
  }
  async replacePlaceholder(pending, replacement) {
    let replaced = false;
    await this.app.vault.process(pending.file, (content) => {
      const index = content.indexOf(pending.placeholder);
      if (index < 0) return content;
      replaced = true;
      return content.slice(0, index) + replacement + content.slice(index + pending.placeholder.length);
    });
    return replaced;
  }
  async removePlaceholder(pending) {
    await this.app.vault.process(
      pending.file,
      (content) => content.replace(pending.placeholder, "")
    );
  }
  getObsidianUrl(file, editor) {
    var _a, _b;
    let path = file.path;
    if (this.settings.includeNearestHeading) {
      const cursorLine = editor.getCursor().line;
      const headings = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.headings) != null ? _b : [];
      const nearestHeading = headings.filter((heading) => heading.position.start.line <= cursorLine).sort((left, right) => right.position.start.line - left.position.start.line)[0];
      if (nearestHeading) {
        const headingLink = (0, import_obsidian3.stripHeadingForLink)(nearestHeading.heading);
        if (headingLink) path += `#${headingLink}`;
      }
    }
    return `obsidian://open?vault=${encodeURIComponent(
      this.app.vault.getName()
    )}&file=${encodeURIComponent(path)}`;
  }
  async copyObsidianUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      new import_obsidian3.Notice("Obsidian URL copied to the clipboard.");
    } catch (error) {
      console.error("Failed to copy the Obsidian URL.", error);
      new import_obsidian3.Notice("Couldn't copy the Obsidian URL to the clipboard.");
    }
  }
  async browseInAnki(query) {
    try {
      await this.createAnkiConnect().guiBrowse(query);
    } catch (error) {
      console.error("Failed to open the card in Anki.", error);
      this.reportAnkiError(error);
    }
  }
  createAnkiConnect() {
    return new AnkiConnect(this.settings.ankiConnectUrl);
  }
};
