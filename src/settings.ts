import {
  Notice,
  PluginSettingTab,
  Setting,
  type App,
  type DropdownComponent,
} from "obsidian";
import { AnkiConnect } from "./ankiconnect";
import type AnkiLinkerPlugin from "./main";

export interface AnkiLinkerSettings {
  ankiConnectUrl: string;
  deckName: string;
  modelName: string;
  tags: string;
  linkText: string;
  copyObsidianUrl: boolean;
  includeNearestHeading: boolean;
  timeoutMinutes: number;
}

export const DEFAULT_SETTINGS: AnkiLinkerSettings = {
  ankiConnectUrl: "http://127.0.0.1:8765",
  deckName: "",
  modelName: "",
  tags: "",
  linkText: "Open in Anki",
  copyObsidianUrl: false,
  includeNearestHeading: true,
  timeoutMinutes: 15,
};

export class AnkiLinkerSettingTab extends PluginSettingTab {
  private decks: string[] = [];
  private models: string[] = [];
  private loaded = false;

  constructor(app: App, private readonly plugin: AnkiLinkerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("AnkiConnect URL").addText((text) =>
      text
        .setPlaceholder(DEFAULT_SETTINGS.ankiConnectUrl)
        .setValue(this.plugin.settings.ankiConnectUrl)
        .onChange(async (value) => {
          this.plugin.settings.ankiConnectUrl = value.trim();
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl)
      .setName("Default deck")
      .setDesc("Choose the deck used when opening Anki's Add dialog.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select a deck");
        this.addStoredOption(dropdown, this.plugin.settings.deckName, this.decks);
        for (const deck of this.decks) dropdown.addOption(deck, deck);
        dropdown
          .setValue(this.plugin.settings.deckName)
          .onChange(async (value) => {
            this.plugin.settings.deckName = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default note type")
      .setDesc("Choose the note type used when opening Anki's Add dialog.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select a note type");
        this.addStoredOption(dropdown, this.plugin.settings.modelName, this.models);
        for (const model of this.models) dropdown.addOption(model, model);
        dropdown
          .setValue(this.plugin.settings.modelName)
          .onChange(async (value) => {
            this.plugin.settings.modelName = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Refresh from Anki")
      .setDesc("Load available decks and note types from Anki.")
      .addButton((button) =>
        button.setButtonText("Refresh from Anki").onClick(async () => {
          await this.refreshOptions(true);
        }),
      );

    new Setting(containerEl)
      .setName("Tags to add")
      .setDesc("Comma-separated tags applied to each new note.")
      .addText((text) =>
        text
          .setPlaceholder("optional, tags")
          .setValue(this.plugin.settings.tags)
          .onChange(async (value) => {
            this.plugin.settings.tags = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Link text")
      .setDesc("Text displayed for the link inserted into the note.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.linkText)
          .setValue(this.plugin.settings.linkText)
          .onChange(async (value) => {
            this.plugin.settings.linkText = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Copy Obsidian URL when creating a card")
      .setDesc("Copy the current note location to the clipboard when creating a card.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.copyObsidianUrl)
          .onChange(async (value) => {
            this.plugin.settings.copyObsidianUrl = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Include nearest heading in copied URL")
      .setDesc("Append the heading above the cursor to copied Obsidian URLs.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeNearestHeading)
          .onChange(async (value) => {
            this.plugin.settings.includeNearestHeading = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Timeout in minutes")
      .setDesc("Cancel a pending card if no new card is detected by this time.")
      .addText((text) => {
        text.inputEl.setAttribute("type", "number");
        text.inputEl.setAttribute("min", "1");
        text.inputEl.setAttribute("step", "1");
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.timeoutMinutes))
          .setValue(String(this.plugin.settings.timeoutMinutes))
          .onChange(async (value) => {
            if (value.trim() === "") return;
            const timeout = Number(value);
            if (!Number.isFinite(timeout) || timeout <= 0) {
              new Notice("Timeout must be a positive number of minutes.");
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

  hide(): void {
    this.loaded = false;
  }

  private async refreshOptions(showSuccess: boolean): Promise<void> {
    try {
      const anki = new AnkiConnect(this.plugin.settings.ankiConnectUrl);
      [this.decks, this.models] = await Promise.all([anki.deckNames(), anki.modelNames()]);
      if (showSuccess) new Notice("Anki decks and note types refreshed.");
      this.display();
    } catch (error) {
      console.error("Failed to refresh Anki settings.", error);
      this.plugin.reportAnkiError(error);
    }
  }

  private addStoredOption(
    dropdown: DropdownComponent,
    value: string,
    options: string[],
  ): void {
    if (value && !options.includes(value)) dropdown.addOption(value, value);
  }
}
