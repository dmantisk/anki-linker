import {
  MarkdownView,
  Notice,
  Plugin,
  stripHeadingForLink,
  type Editor,
  type TFile,
} from "obsidian";
import {
  AnkiConnect,
  ANKI_UNREACHABLE_MESSAGE,
  AnkiConnectError,
} from "./ankiconnect";
import {
  AnkiLinkerSettingTab,
  DEFAULT_SETTINGS,
  type AnkiLinkerSettings,
} from "./settings";

const NEW_CARD_QUERY = "added:2";

interface PendingCard {
  file: TFile;
  placeholderSave: Promise<void>;
  placeholder: string;
  snapshotId: number;
  failures: number;
  polling: boolean;
  intervalId: number | null;
  timeoutId: number | null;
  notice: Notice;
}

type PendingEndReason = "cancel" | "timeout";

export default class AnkiLinkerPlugin extends Plugin {
  settings: AnkiLinkerSettings = { ...DEFAULT_SETTINGS };
  private pendingCard: PendingCard | null = null;
  private triggerVersion = 0;

  async onload(): Promise<void> {
    const saved = (await this.loadData()) as Partial<AnkiLinkerSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    this.addSettingTab(new AnkiLinkerSettingTab(this.app, this));

    this.addCommand({
      id: "create-anki-card",
      name: "Create Anki card here",
      editorCallback: (editor, view) => {
        const markdownView =
          view instanceof MarkdownView
            ? view
            : this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view.file || !markdownView || markdownView.file !== view.file) {
          new Notice("Open a note before creating an Anki card.");
          return;
        }
        void this.createCard(editor, markdownView, view.file);
      },
    });

    this.addCommand({
      id: "cancel-pending-anki-card",
      name: "Cancel pending Anki card",
      callback: () => {
        this.triggerVersion++;
        if (!this.pendingCard) {
          new Notice("There is no pending Anki card.");
          return;
        }
        void this.endPendingCard(this.pendingCard, "cancel", true);
      },
    });

    this.registerObsidianProtocolHandler("anki-card", async (params) => {
      const cardId = params.cid;
      const noteId = params.nid;
      if (cardId !== undefined && /^\d+$/.test(cardId)) {
        await this.browseInAnki(`cid:${cardId}`);
        return;
      }
      if (noteId !== undefined && /^\d+$/.test(noteId)) {
        await this.browseInAnki(`nid:${noteId}`);
        return;
      }
      new Notice("Invalid Anki card link. Expected a numeric cid or nid.");
    });
  }

  onunload(): void {
    this.triggerVersion++;
    if (this.pendingCard) {
      void this.endPendingCard(this.pendingCard, "cancel", false);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  reportAnkiError(error: unknown): void {
    new Notice(
      error instanceof AnkiConnectError
        ? `Anki: ${error.message}`
        : ANKI_UNREACHABLE_MESSAGE,
    );
  }

  private async createCard(
    editor: Editor,
    view: MarkdownView,
    file: TFile,
  ): Promise<void> {
    const triggerVersion = ++this.triggerVersion;
    await this.cancelActivePendingCard();
    if (triggerVersion !== this.triggerVersion) return;

    if (!this.settings.deckName || !this.settings.modelName) {
      new Notice("Choose a default Anki deck and note type in the plugin settings first.");
      return;
    }

    const obsidianUrl = this.settings.copyObsidianUrl
      ? this.getObsidianUrl(file, editor)
      : null;
    if (obsidianUrl) await this.copyObsidianUrl(obsidianUrl);
    if (triggerVersion !== this.triggerVersion) return;

    const placeholder = `%%anki-pending:${crypto.randomUUID()}%%`;
    const insertionPoint = editor.getCursor("to");
    editor.replaceRange(placeholder, insertionPoint);
    const placeholderSave = view.save();

    const notice = new Notice("Waiting for Anki card… click to cancel", 0);
    notice.noticeEl.style.cursor = "pointer";
    notice.noticeEl.setAttribute("role", "button");
    notice.noticeEl.tabIndex = 0;

    const pending: PendingCard = {
      file,
      placeholderSave,
      placeholder,
      snapshotId: 0,
      failures: 0,
      polling: false,
      intervalId: null,
      timeoutId: null,
      notice,
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
      this.settings.timeoutMinutes * 60 * 1000,
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
      const fields: Record<string, string> = {};
      for (const fieldName of fieldNames) fields[fieldName] = "";
      if (obsidianUrl && this.settings.obsidianUrlField) {
        if (fieldNames.includes(this.settings.obsidianUrlField)) {
          fields[this.settings.obsidianUrlField] = obsidianUrl;
        } else {
          new Notice(
            `The selected URL field "${this.settings.obsidianUrlField}" isn't available in the selected note type.`,
          );
        }
      }
      const tags = this.settings.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      await anki.guiAddCards({
        deckName: this.settings.deckName,
        modelName: this.settings.modelName,
        fields,
        tags,
      });
      if (this.pendingCard !== pending) return;

      pending.intervalId = window.setInterval(() => {
        void this.pollForCard(pending);
      }, 2000);
    } catch (error) {
      console.error("Failed to start Anki card creation.", error);
      if (this.pendingCard === pending) {
        await this.endPendingCard(pending, "cancel", false);
        this.reportAnkiError(error);
      }
    }
  }

  private async pollForCard(pending: PendingCard): Promise<void> {
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

  private async completePendingCard(pending: PendingCard, cardId: number): Promise<void> {
    if (this.pendingCard !== pending) return;
    this.clearPendingTimers(pending);
    pending.notice.hide();
    this.pendingCard = null;

    const link = `[${this.settings.linkText || DEFAULT_SETTINGS.linkText}](obsidian://anki-card?cid=${cardId})`;
    try {
      const replaced = await this.replacePlaceholder(pending, link);
      if (replaced) return;
      await navigator.clipboard.writeText(link);
      new Notice("The placeholder was removed. The Anki link was copied to the clipboard.");
    } catch (error) {
      console.error("Failed to insert the Anki link into the note.", error);
      try {
        await this.removePlaceholder(pending);
      } catch (cleanupError) {
        console.error("Failed to remove the pending-card placeholder.", cleanupError);
      }
      try {
        await navigator.clipboard.writeText(link);
        new Notice("Couldn't update the original note. The Anki link was copied to the clipboard.");
      } catch (clipboardError) {
        console.error("Failed to copy the Anki link.", clipboardError);
        new Notice("Couldn't update the original note or copy the Anki link.");
      }
    }
  }

  private async endPendingCard(
    pending: PendingCard,
    reason: PendingEndReason,
    showNotice: boolean,
  ): Promise<void> {
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
      new Notice("Couldn't remove the pending-card placeholder from the note.");
    }
    if (!showNotice) return;
    if (reason === "cancel") new Notice("Pending Anki card canceled.");
    if (reason === "timeout") new Notice("Timed out waiting for an Anki card.");
  }

  private async cancelActivePendingCard(): Promise<void> {
    if (this.pendingCard) {
      await this.endPendingCard(this.pendingCard, "cancel", false);
    }
  }

  private clearPendingTimers(pending: PendingCard): void {
    if (pending.intervalId !== null) {
      window.clearInterval(pending.intervalId);
      pending.intervalId = null;
    }
    if (pending.timeoutId !== null) {
      window.clearTimeout(pending.timeoutId);
      pending.timeoutId = null;
    }
  }

  private async replacePlaceholder(pending: PendingCard, replacement: string): Promise<boolean> {
    let replaced = false;
    // Process the original file's latest contents instead of relying on a stale editor snapshot.
    await this.app.vault.process(pending.file, (content) => {
      const index = content.indexOf(pending.placeholder);
      if (index < 0) return content;
      replaced = true;
      return (
        content.slice(0, index) +
        replacement +
        content.slice(index + pending.placeholder.length)
      );
    });
    return replaced;
  }

  private async removePlaceholder(pending: PendingCard): Promise<void> {
    // The marker, rather than a saved cursor position, remains the stable edit location.
    await this.app.vault.process(pending.file, (content) =>
      content.replace(pending.placeholder, ""),
    );
  }

  private getObsidianUrl(file: TFile, editor: Editor): string {
    let path = file.path;
    if (this.settings.includeNearestHeading) {
      const cursorLine = editor.getCursor().line;
      // Metadata-cache heading positions are zero-based, matching Editor cursor lines.
      const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
      const nearestHeading = headings
        .filter((heading) => heading.position.start.line <= cursorLine)
        .sort((left, right) => right.position.start.line - left.position.start.line)[0];
      if (nearestHeading) {
        const headingLink = stripHeadingForLink(nearestHeading.heading);
        if (headingLink) path += `#${headingLink}`;
      }
    }
    return `obsidian://open?vault=${encodeURIComponent(
      this.app.vault.getName(),
    )}&file=${encodeURIComponent(path)}`;
  }

  private async copyObsidianUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      new Notice("Obsidian URL copied to the clipboard.");
    } catch (error) {
      console.error("Failed to copy the Obsidian URL.", error);
      new Notice("Couldn't copy the Obsidian URL to the clipboard.");
    }
  }

  private async browseInAnki(query: string): Promise<void> {
    try {
      await this.createAnkiConnect().guiBrowse(query);
    } catch (error) {
      console.error("Failed to open the card in Anki.", error);
      this.reportAnkiError(error);
    }
  }

  private createAnkiConnect(): AnkiConnect {
    return new AnkiConnect(this.settings.ankiConnectUrl);
  }
}
