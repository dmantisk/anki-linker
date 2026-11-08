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
  obsidianUrlField: string;
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
  obsidianUrlField: "",
  includeNearestHeading: true,
  timeoutMinutes: 15,
};

export class AnkiLinkerSettingTab extends PluginSettingTab {
  private decks: string[] = [];
  private models: string[] = [];
  private modelFields: string[] = [];
  private fieldsModelName = "";
  private loaded = false;

  constructor(app: App, private readonly plugin: AnkiLinkerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const connectionGroup = this.createSection(containerEl, "Connection");
    new Setting(connectionGroup)
      .setName("AnkiConnect URL")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.ankiConnectUrl)
          .setValue(this.plugin.settings.ankiConnectUrl)
          .onChange(async (value) => {
            this.plugin.settings.ankiConnectUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(connectionGroup)
      .setName("Refresh from Anki")
      .setDesc("Load available decks and note types from Anki.")
      .addButton((button) =>
        button.setButtonText("Refresh from Anki").onClick(async () => {
          await this.refreshOptions(true);
        }),
      );

    const cardCreationGroup = this.createSection(containerEl, "Card Creation");
    new Setting(cardCreationGroup)
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

    new Setting(cardCreationGroup)
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
            this.plugin.settings.obsidianUrlField = "";
            this.modelFields = [];
            this.fieldsModelName = "";
            await this.plugin.saveSettings();
            this.display();
            if (value) void this.refreshModelFields(value);
          });
      });

    new Setting(cardCreationGroup)
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

    const urlGroup = this.createSection(containerEl, "URL Handling");
    new Setting(urlGroup)
      .setName("Copy Obsidian URL when creating a card")
      .setDesc("Copy the current note location and optionally add it to an Anki field.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.copyObsidianUrl)
          .onChange(async (value) => {
            this.plugin.settings.copyObsidianUrl = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.copyObsidianUrl) {
      new Setting(urlGroup)
        .setName("Obsidian URL field")
        .setDesc("Choose the Anki note field to prefill with the copied URL.")
        .addDropdown((dropdown) => {
          dropdown.addOption("", "Don't add URL to a field");
          this.addStoredOption(
            dropdown,
            this.plugin.settings.obsidianUrlField,
            this.modelFields,
          );
          for (const field of this.modelFields) dropdown.addOption(field, field);
          dropdown
            .setValue(this.plugin.settings.obsidianUrlField)
            .onChange(async (value) => {
              this.plugin.settings.obsidianUrlField = value;
              await this.plugin.saveSettings();
            });
          if (!this.plugin.settings.modelName || this.fieldsModelName !== this.plugin.settings.modelName) {
            dropdown.selectEl.disabled = true;
          }
        });
    }

    new Setting(urlGroup)
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

    const linkDisplayGroup = this.createSection(containerEl, "Link Display");
    new Setting(linkDisplayGroup)
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

    const behaviorGroup = this.createSection(containerEl, "Behavior");
    new Setting(behaviorGroup)
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

  private createSection(containerEl: HTMLElement, title: string): HTMLElement {
    containerEl.createEl("h3", { text: title, cls: "anki-linker-section-title" });
    return containerEl.createDiv({ cls: "anki-linker-settings-group" });
  }

  private async refreshOptions(showSuccess: boolean): Promise<void> {
    try {
      const anki = new AnkiConnect(this.plugin.settings.ankiConnectUrl);
      [this.decks, this.models] = await Promise.all([anki.deckNames(), anki.modelNames()]);
      const selectedModel = this.plugin.settings.modelName;
      if (selectedModel && this.models.includes(selectedModel)) {
        this.modelFields = await anki.modelFieldNames(selectedModel);
        this.fieldsModelName = selectedModel;
        if (
          this.plugin.settings.obsidianUrlField &&
          !this.modelFields.includes(this.plugin.settings.obsidianUrlField)
        ) {
          this.plugin.settings.obsidianUrlField = "";
          await this.plugin.saveSettings();
        }
      } else {
        this.modelFields = [];
        this.fieldsModelName = "";
      }
      if (showSuccess) new Notice("Anki decks and note types refreshed.");
      this.display();
    } catch (error) {
      console.error("Failed to refresh Anki settings.", error);
      this.plugin.reportAnkiError(error);
    }
  }

  private async refreshModelFields(modelName: string): Promise<void> {
    try {
      const fields = await new AnkiConnect(
        this.plugin.settings.ankiConnectUrl,
      ).modelFieldNames(modelName);
      if (this.plugin.settings.modelName !== modelName) return;
      this.modelFields = fields;
      this.fieldsModelName = modelName;
      if (
        this.plugin.settings.obsidianUrlField &&
        !fields.includes(this.plugin.settings.obsidianUrlField)
      ) {
        this.plugin.settings.obsidianUrlField = "";
        await this.plugin.saveSettings();
      }
      this.display();
    } catch (error) {
      console.error(`Failed to load fields for Anki note type "${modelName}".`, error);
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