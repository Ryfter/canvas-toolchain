export interface PanoptoConfig {
  domain: string;
  iframeWhitelisted: boolean | null;
  clientId?: string;
  clientSecret?: string;
}
