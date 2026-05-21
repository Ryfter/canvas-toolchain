import type { LayoutAdapter, LayoutAdapterInput, RawLayoutOutput } from './layout_adapter.js';

export class PasteAdapter implements LayoutAdapter {
  async generateLayout(_input: LayoutAdapterInput): Promise<RawLayoutOutput> {
    throw new Error(
      'PasteAdapter is fulfilled via the paste_layout MCP tool: ' +
        'the professor generates in Stitch/Figma/etc. and pastes the HTML + CSS ' +
        'back via paste_layout({ html, css, sourceTool: "stitch" }).',
    );
  }
}
