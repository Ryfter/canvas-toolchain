import { type JsonSchemaFragment, validateJsonSchemaFragment } from './json_schema.js';
import { type SlotName, extractSlotPlaceholders, isSlotName, validateSlotName } from './slots.js';

export { extractSlotPlaceholders, isSlotName };

export interface TemplateManifest {
  schemaVersion: 1;
  kind: 'template';
  id: string;
  version: string;
  name?: string;
  description?: string;
  tier: 'free' | 'premium';
  slots: SlotName[];
  tags: string[];
  files?: string[];
}

export interface SlotConstraint {
  required?: boolean;
  maxLength?: number;
  fields?: Record<string, JsonSchemaFragment>;
  schema?: JsonSchemaFragment;
}

export type SlotsJson = Record<string, SlotConstraint>;

export interface TemplateResource {
  manifest: TemplateManifest;
  structureHtml: string;
  slotsJson: SlotsJson;
}

export function validateTemplateResource(resource: TemplateResource): string[] {
  const issues: string[] = [];
  validateTemplateManifest(resource.manifest, issues);
  validateStructureHtml(resource.structureHtml, resource.manifest.slots ?? [], issues);
  validateSlotsJson(resource.slotsJson, resource.manifest.slots ?? [], issues);
  return issues;
}

export function validateTemplateManifest(value: unknown, issues: string[] = []): string[] {
  if (!isRecord(value)) {
    issues.push('manifest must be an object');
    return issues;
  }

  if (value.schemaVersion !== 1) issues.push('manifest.schemaVersion must be 1');
  if (value.kind !== 'template') issues.push('manifest.kind must be template');
  validateSegment(value.id, 'manifest.id', issues);
  validateVersion(value.version, 'manifest.version', issues);

  if (!Array.isArray(value.slots) || value.slots.length === 0) {
    issues.push('manifest.slots must be a non-empty array');
  } else {
    value.slots.forEach((slot, index) => validateSlotName(slot, `manifest.slots[${index}]`, issues));
  }

  if (!Array.isArray(value.tags)) {
    issues.push('manifest.tags must be an array');
  } else {
    value.tags.forEach((tag, index) => {
      if (typeof tag !== 'string' || tag.trim() === '') issues.push(`manifest.tags[${index}] must be a non-empty string`);
    });
  }

  if (value.tier !== 'free' && value.tier !== 'premium') {
    issues.push('manifest.tier must be free or premium');
  }

  return issues;
}

function validateStructureHtml(value: unknown, manifestSlots: SlotName[], issues: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push('structure.html must be a non-empty string');
    return;
  }

  const manifestSlotSet = new Set<string>(manifestSlots);
  const placeholders = extractSlotPlaceholders(value);
  if (placeholders.length === 0) {
    issues.push('structure.html must include at least one {{slot:name}} placeholder');
  }

  for (const slot of placeholders) {
    validateSlotName(slot, `structure.html slot ${slot}`, issues);
    if (!manifestSlotSet.has(slot)) {
      issues.push(`structure.html slot ${slot} must be declared in manifest.slots`);
    }
  }
}

function validateSlotsJson(value: unknown, manifestSlots: SlotName[], issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('slots.json must be an object');
    return;
  }

  const manifestSlotSet = new Set<string>(manifestSlots);
  for (const [slot, constraint] of Object.entries(value)) {
    validateSlotName(slot, `slots.json key ${slot}`, issues);
    if (!manifestSlotSet.has(slot)) {
      issues.push(`slots.json key ${slot} must be declared in manifest.slots`);
    }
    validateSlotConstraint(constraint, `slots.json.${slot}`, issues);
  }
}

function validateSlotConstraint(value: unknown, field: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return;
  }

  if (value.required !== undefined && typeof value.required !== 'boolean') {
    issues.push(`${field}.required must be boolean when provided`);
  }

  if (value.maxLength !== undefined && (typeof value.maxLength !== 'number' || value.maxLength <= 0)) {
    issues.push(`${field}.maxLength must be a positive number when provided`);
  }

  if (value.fields !== undefined) {
    if (!isRecord(value.fields)) {
      issues.push(`${field}.fields must be an object when provided`);
    } else {
      for (const [name, fragment] of Object.entries(value.fields)) {
        validateJsonSchemaFragment(fragment, `${field}.fields.${name}`, issues);
      }
    }
  }

  if (value.schema !== undefined) {
    validateJsonSchemaFragment(value.schema, `${field}.schema`, issues);
  }
}

function validateSegment(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    issues.push(`${field} must be a safe registry segment`);
  }
}

function validateVersion(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(value)) {
    issues.push(`${field} must be a safe version`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
