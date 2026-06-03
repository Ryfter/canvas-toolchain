// packages/canvas-design-studio/src/tools/widget/catalog/index.ts

import type { Renderer, WidgetKind } from '../types.js';
import { cardFlipRevealRenderer } from './card-flip-reveal.js';

/** Registry of all catalog renderers. Plan B adds the remaining 5 entries.
 *  An UNKNOWN kind (not in this map) routes to the experimental renderer
 *  (Plan C) IF render_widget is called with allowExperimental: true. */
export const CATALOG: Partial<Record<WidgetKind, Renderer>> = {
  'card-flip-reveal': cardFlipRevealRenderer,
};
