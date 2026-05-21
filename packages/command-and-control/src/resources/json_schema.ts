export type JsonSchemaFragment = Record<string, unknown>;

export function validateJsonSchemaFragment(value: unknown, field: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${field} must be a JSON Schema fragment object`);
    return;
  }

  if (value.type !== undefined && !(typeof value.type === 'string' || isStringArray(value.type))) {
    issues.push(`${field}.type must be a string or string array when provided`);
  }

  if (value.required !== undefined && !isStringArray(value.required)) {
    issues.push(`${field}.required must be an array of strings when provided`);
  }

  if (value.enum !== undefined && !Array.isArray(value.enum)) {
    issues.push(`${field}.enum must be an array when provided`);
  }

  for (const key of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'number') {
      issues.push(`${field}.${key} must be a number when provided`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
