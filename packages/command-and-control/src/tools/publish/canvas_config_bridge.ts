import { loadCanvasConfig } from '../setup_canvas.js';

export interface InstitutionConfigBridge {
  canvasUrl: string;
  apiToken: string;
}

export function loadInstitutionConfig(): InstitutionConfigBridge {
  const cfg = loadCanvasConfig();
  return {
    canvasUrl: `https://${cfg.host}`,
    apiToken: cfg.token,
  };
}
