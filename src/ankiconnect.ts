import { requestUrl } from "obsidian";

const ANKICONNECT_VERSION = 6;

export const ANKI_UNREACHABLE_MESSAGE =
  "Can't reach Anki. Is it running with AnkiConnect installed?";

export class AnkiConnectError extends Error {}

interface AnkiConnectResponse<T> {
  result: T;
  error: string | null;
}

export class AnkiConnect {
  constructor(private readonly url: string) {}

  async deckNames(): Promise<string[]> {
    const result = await this.request<unknown>("deckNames", {});
    return this.stringArray(result, "deckNames");
  }

  async modelNames(): Promise<string[]> {
    const result = await this.request<unknown>("modelNames", {});
    return this.stringArray(result, "modelNames");
  }

  async modelFieldNames(modelName: string): Promise<string[]> {
    const result = await this.request<unknown>("modelFieldNames", { modelName });
    return this.stringArray(result, "modelFieldNames");
  }

  async findCards(query: string): Promise<number[]> {
    const result = await this.request<unknown>("findCards", { query });
    if (
      !Array.isArray(result) ||
      !result.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 0)
    ) {
      throw new Error("AnkiConnect returned an invalid card ID list.");
    }
    return result;
  }

  async guiAddCards(note: {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags: string[];
  }): Promise<unknown> {
    return this.request("guiAddCards", { note });
  }

  async guiBrowse(query: string): Promise<unknown> {
    return this.request("guiBrowse", { query });
  }

  private async request<T>(action: string, params: Record<string, unknown>): Promise<T> {
    // requestUrl is Obsidian's supported HTTP API and avoids browser fetch restrictions.
    const response = await requestUrl({
      url: this.url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: ANKICONNECT_VERSION, params }),
    });
    const payload = response.json as AnkiConnectResponse<T>;
    if (payload.error !== null) {
      throw new AnkiConnectError(payload.error || `AnkiConnect action "${action}" failed.`);
    }
    return payload.result;
  }

  private stringArray(value: unknown, action: string): string[] {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error(`AnkiConnect returned an invalid result for ${action}.`);
    }
    return value;
  }
}
