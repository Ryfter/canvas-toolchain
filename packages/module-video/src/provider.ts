export interface VideoResult {
  id: string;
  title: string;
  url: string;
  durationSeconds?: number;
}

export interface EmbedOptions {
  width?: number;
  height?: number;
  startSeconds?: number;
}

export interface VideoProvider {
  id: string;
  name: string;
  capabilities: {
    search: boolean;
    embed: boolean;
    fetchCaptions: boolean;
  };
  search?(query: string): Promise<VideoResult[]>;
  embed(ref: string, opts?: EmbedOptions): Promise<string>;
  fetchCaptions?(ref: string): Promise<string>;
}
