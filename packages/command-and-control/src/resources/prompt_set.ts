import { type JsonSchemaFragment, validateJsonSchemaFragment } from './json_schema.js';
import { type SlotName, validateSlotName } from './slots.js';

export interface PromptSetManifest {
  schemaVersion: 1;
  kind: 'prompt';
  id: string;
  version: string;
  slots: SlotName[];
  tier: 'free' | 'premium';
}

export interface PromptDefinition {
  prompt: string;
  outputSchema: JsonSchemaFragment;
}

export type PromptsJson = Record<string, PromptDefinition>;

export interface PromptSetResource {
  manifest: PromptSetManifest;
  promptsJson: PromptsJson;
}

export function validatePromptSetResource(resource: PromptSetResource): string[] {
  const issues: string[] = [];
  validatePromptSetManifest(resource.manifest, issues);
  validatePromptsJson(resource.promptsJson, resource.manifest.slots ?? [], issues);
  return issues;
}

export function validatePromptSetManifest(value: unknown, issues: string[] = []): string[] {
  if (!isRecord(value)) {
    issues.push('manifest must be an object');
    return issues;
  }

  if (value.schemaVersion !== 1) issues.push('manifest.schemaVersion must be 1');
  if (value.kind !== 'prompt') issues.push('manifest.kind must be prompt');
  validateSegment(value.id, 'manifest.id', issues);
  validateVersion(value.version, 'manifest.version', issues);

  if (!Array.isArray(value.slots) || value.slots.length === 0) {
    issues.push('manifest.slots must be a non-empty array');
  } else {
    value.slots.forEach((slot, index) => validateSlotName(slot, `manifest.slots[${index}]`, issues));
  }

  if (value.tier !== 'free' && value.tier !== 'premium') {
    issues.push('manifest.tier must be free or premium');
  }

  return issues;
}

function validatePromptsJson(value: unknown, manifestSlots: SlotName[], issues: string[]): void {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    issues.push('prompts.json must be a non-empty object');
    return;
  }

  const manifestSlotSet = new Set<string>(manifestSlots);
  for (const [slot, definition] of Object.entries(value)) {
    validateSlotName(slot, `prompts.json key ${slot}`, issues);
    if (!manifestSlotSet.has(slot)) {
      issues.push(`prompts.json key ${slot} must be declared in manifest.slots`);
    }
    validatePromptDefinition(definition, `prompts.json.${slot}`, issues);
  }
}

function validatePromptDefinition(value: unknown, field: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return;
  }

  if (typeof value.prompt !== 'string' || value.prompt.trim() === '') {
    issues.push(`${field}.prompt must be a non-empty string`);
  } else {
    validatePromptPlaceholders(value.prompt, `${field}.prompt`, issues);
  }

  validateJsonSchemaFragment(value.outputSchema, `${field}.outputSchema`, issues);
}

function validatePromptPlaceholders(prompt: string, field: string, issues: string[]): void {
  for (const match of prompt.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const placeholder = match[1] ?? '';
    if (!/^[a-z][a-zA-Z0-9]*$/.test(placeholder)) {
      issues.push(`${field} placeholder ${placeholder} must use camelCase`);
    }
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
