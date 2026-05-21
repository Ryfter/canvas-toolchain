import type { SlotName } from '@canvas-toolchain/shared-types';

export interface LayoutAdapterInput {
  /** What the layout should accomplish. */
  intent: string;
  /** Slots the result should include. Adapter tries to honor these. */
  desiredSlots: SlotName[];
  /** Brand context to bias visual style. */
  brandContext?: {
    colors: {
      primary: string;
      accent: string;
      background: string;
      text: string;
    };
    typography: {
      headingFontStack: string;
      bodyFontStack: string;
    };
    moodWords: string[];
  };
  /** Sample content to render so the layout is not empty. */
  sampleContent?: Record<string, unknown>;
  /** Output format preference. */
  outputFormat?: 'html-css';
}

export interface RawLayoutOutput {
  html: string;
  css: string;
  source: {
    adapter: string;
    rawInput: LayoutAdapterInput;
    fetchedAt: string;
  };
}

export interface LayoutAdapter {
  generateLayout(input: LayoutAdapterInput): Promise<RawLayoutOutput>;
}
