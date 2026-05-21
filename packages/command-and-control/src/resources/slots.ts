export const CORE_SLOTS = [
  'hero',
  'intro',
  'body',
  'callout',
  'comparison',
  'examples',
  'objectives',
  'resources',
  'footer',
  'panopto',
] as const;

export type CoreSlot = (typeof CORE_SLOTS)[number];
export type ExtensionSlot = `x-${string}`;
export type SlotName = CoreSlot | ExtensionSlot;

const coreSlotSet = new Set<string>(CORE_SLOTS);
const extensionSlotPattern = /^x-[a-z][a-z0-9-]*$/;

export function isSlotName(value: unknown): value is SlotName {
  return typeof value === 'string' && (coreSlotSet.has(value) || extensionSlotPattern.test(value));
}

export function validateSlotName(value: unknown, field: string, issues: string[]): void {
  if (!isSlotName(value)) {
    issues.push(`${field} must be a controlled slot or x-* extension`);
  }
}

export function extractSlotPlaceholders(structureHtml: string): string[] {
  return [
    ...new Set(
      [...structureHtml.matchAll(/\{\{\s*slot:([a-zA-Z0-9-]+)\s*\}\}/g)]
        .map((match) => match[1])
        .filter((slot): slot is string => Boolean(slot)),
    ),
  ];
}
