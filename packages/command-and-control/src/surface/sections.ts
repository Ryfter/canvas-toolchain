import type { SectionId } from './operation.js';

export const SECTIONS: Record<SectionId, { description: string }> = {
  modules:       { description: 'Plug-in module discovery, install, enable/disable.' },
  registry:      { description: 'Resource registry: search, install, uninstall, lockfiles.' },
  transcripts:   { description: 'Transcript enrichment, comparison, and week mapping.' },
  research:      { description: 'News feeds, recent developments, quote banks, calendars.' },
  accessibility: { description: 'Deep accessibility checks beyond the standard audit.' },
  snapshots:     { description: 'Publish snapshot listing and pruning.' },
  design:        { description: 'Canvas pattern catalog, previews, layout templates.' },
  admin:         { description: 'Institution profile, dashboard, feedback, defaults.' },
};

export const SECTION_IDS = Object.keys(SECTIONS) as SectionId[];
