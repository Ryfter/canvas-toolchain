import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const templatesRoot = join(__dirname, '..', 'templates');

const pageTypes = [
  {
    id: 'front-page',
    slots: ['hero', 'x-course-introduction', 'x-what-you-will-learn', 'x-how-this-course-works', 'x-instructor'],
    optionalSlots: []
  },
  {
    id: 'overview',
    slots: ['hero', 'callout', 'x-introduction', 'x-activities'],
    optionalSlots: []
  },
  {
    id: 'resources',
    slots: ['hero', 'x-slides', 'x-videos', 'x-readings', 'x-other'],
    optionalSlots: ['x-other']
  },
  {
    id: 'slides',
    slots: ['hero', 'x-slide-deck', 'x-about-these-slides', 'x-key-topics'],
    optionalSlots: ['x-about-these-slides', 'x-key-topics']
  },
  {
    id: 'videos',
    slots: ['hero', 'x-videos', 'x-what-to-watch-for'],
    optionalSlots: ['x-what-to-watch-for']
  },
  {
    id: 'assignment',
    slots: ['hero', 'callout', 'x-rubric', 'x-submission-details'],
    optionalSlots: ['x-rubric']
  },
  {
    id: 'engage-assignment',
    slots: ['hero', 'x-what-we-are-doing', 'x-instructions', 'x-time-deliverable'],
    optionalSlots: []
  },
  {
    id: 'proj-assignment',
    slots: ['hero', 'callout', 'x-timeline', 'x-team', 'x-rubric', 'x-submission-details'],
    optionalSlots: ['x-timeline', 'x-team', 'x-rubric']
  },
  {
    id: 'tech-assignment',
    slots: ['hero', 'callout', 'x-setup', 'x-tasks', 'x-team', 'x-deliverable', 'x-rubric'],
    optionalSlots: ['x-setup', 'x-team', 'x-rubric']
  },
  {
    id: 'reading',
    slots: ['hero', 'x-the-reading', 'x-why-this-reading', 'x-as-you-read'],
    optionalSlots: ['x-as-you-read']
  },
  {
    id: 'reading-quiz',
    slots: ['hero', 'x-quiz-details', 'x-topics-covered', 'x-access'],
    optionalSlots: []
  },
  {
    id: 'weekly-quiz',
    slots: ['hero', 'x-quiz-details', 'x-topics-covered', 'x-access'],
    optionalSlots: []
  },
  {
    id: 'lab',
    slots: ['hero', 'callout', 'x-setup', 'x-instructions', 'x-submission'],
    optionalSlots: ['x-setup']
  },
  {
    id: 'discussion-board',
    slots: ['hero', 'callout', 'x-requirements', 'x-grading'],
    optionalSlots: ['x-grading']
  },
  {
    id: 'extra-credit',
    slots: ['hero', 'x-opportunity', 'x-requirements', 'x-points-deadline'],
    optionalSlots: []
  },
  {
    id: 'custom',
    slots: ['hero', 'body'],
    optionalSlots: []
  }
];

// 1. Generate Templates
for (const p of pageTypes) {
  const dir = join(templatesRoot, 'template', `${p.id}@1.0.0`);
  mkdirSync(dir, { recursive: true });

  const manifest = {
    schemaVersion: 1,
    kind: 'template',
    id: p.id,
    version: '1.0.0',
    tier: 'free',
    slots: p.slots,
    tags: [p.id, 'default'],
    files: ['structure.html', 'slots.json']
  };

  const structureHtml = `<div style="font-family: Lato, sans-serif; max-width: 900px; margin: 0 auto; color: #1A1A1A;">\n` +
    p.slots.map(s => `  {{slot:${s}}}`).join('\n') + '\n' +
    `</div>`;

  const slotsJson = {};
  for (const s of p.slots) {
    slotsJson[s] = {
      required: !p.optionalSlots.includes(s)
    };
  }

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(dir, 'structure.html'), structureHtml + '\n');
  writeFileSync(join(dir, 'slots.json'), JSON.stringify(slotsJson, null, 2) + '\n');
}

// Gather all slot names across all page types
const allSlots = Array.from(new Set(pageTypes.flatMap(p => p.slots))).sort();

// 2. Generate Theme
const themeDir = join(templatesRoot, 'theme', 'cds-default@1.0.0');
mkdirSync(themeDir, { recursive: true });

const themeManifest = {
  schemaVersion: 1,
  kind: 'theme',
  id: 'cds-default',
  version: '1.0.0',
  compatibleSlots: allSlots,
  tags: ['default', 'academic'],
  tier: 'free',
  files: ['theme.json']
};

const slotStyles = {};
for (const s of allSlots) {
  if (s === 'hero') {
    slotStyles[s] = {
      css: "min-height: 180px; display: flex; align-items: flex-end; padding: 24px; border-radius: 10px; margin-bottom: 24px; color: white;",
      imagePrompt: "A minimalist hero graphic representing {{topic}} for {{semester}} course"
    };
  } else if (s === 'callout') {
    slotStyles[s] = {
      css: "border-left: 4px solid {{colors.primary}}; border-radius: 0 8px 8px 0; padding: 20px 24px; margin-bottom: 20px;",
      imagePrompt: "A subtle icon or abstract vector background related to {{topic}}"
    };
  } else {
    slotStyles[s] = {
      css: "background: white; border: 1px solid #e0e0d8; border-radius: 8px; padding: 24px; margin-bottom: 20px;",
      imagePrompt: "A clean illustration related to {{topic}}"
    };
  }
}

const themeJson = {
  colors: {
    primary: "#002F6C",
    primaryLight: "#EBF2FA",
    primaryDark: "#001E44",
    text: "#1A1A1A",
    background: "#FFFFFF",
    border: "#E0E0D8"
  },
  typography: {
    fontFamily: "Lato, sans-serif"
  },
  slotStyles,
  globalCss: ""
};

writeFileSync(join(themeDir, 'manifest.json'), JSON.stringify(themeManifest, null, 2) + '\n');
writeFileSync(join(themeDir, 'theme.json'), JSON.stringify(themeJson, null, 2) + '\n');

// 3. Generate Prompts
const promptDir = join(templatesRoot, 'prompt', 'cds-default@1.0.0');
mkdirSync(promptDir, { recursive: true });

const promptManifest = {
  schemaVersion: 1,
  kind: 'prompt',
  id: 'cds-default',
  version: '1.0.0',
  slots: allSlots,
  tier: 'free',
  files: ['prompts.json']
};

const promptsJson = {};
for (const s of allSlots) {
  if (s === 'hero') {
    promptsJson[s] = {
      prompt: "Generate a premium hero visual card text for {{topic}} in {{semester}}.",
      outputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" }
        },
        required: ["title"]
      }
    };
  } else {
    promptsJson[s] = {
      prompt: "Generate the content for slot {{slotName}} of {{topic}}.",
      outputSchema: {
        type: "object",
        properties: {
          content: { type: "string" }
        },
        required: ["content"]
      }
    };
  }
}

writeFileSync(join(promptDir, 'manifest.json'), JSON.stringify(promptManifest, null, 2) + '\n');
writeFileSync(join(promptDir, 'prompts.json'), JSON.stringify(promptsJson, null, 2) + '\n');

// 4. Generate Bundle
const bundleDir = join(templatesRoot, 'bundle', 'cds-defaults@1.0.0');
mkdirSync(bundleDir, { recursive: true });

const bundleManifest = {
  schemaVersion: 1,
  kind: 'bundle',
  id: 'cds-defaults',
  version: '1.0.0',
  tier: 'free',
  includes: [
    { kind: 'theme', id: 'cds-default', version: '1.0.0' },
    { kind: 'prompt', id: 'cds-default', version: '1.0.0' },
    ...pageTypes.map(p => ({ kind: 'template', id: p.id, version: '1.0.0' }))
  ]
};

writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify(bundleManifest, null, 2) + '\n');

console.log('Successfully generated seed templates, theme, prompts, and bundle.');
