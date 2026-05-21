export interface ValidationViolation {
  rule: string;
  context: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

const RULES: Array<{ name: string; pattern: RegExp; message: string }> = [
  {
    name: 'no-style-block',
    pattern: /<style[\s>]/i,
    message: 'No <style> blocks — all CSS must be inline style="" attributes',
  },
  {
    name: 'no-script-tag',
    pattern: /<script[\s>]/i,
    message: 'No <script> tags — JavaScript is not allowed in Canvas RCE',
  },
  {
    name: 'no-box-shadow',
    pattern: /box-shadow\s*:/i,
    message: 'No box-shadow — stripped by Canvas sanitizer',
  },
  {
    name: 'no-gap-property',
    pattern: /(?:^|;|\s)gap\s*:/i,
    message: 'No gap property in flex/grid — use margin on children instead',
  },
  {
    name: 'no-opacity-property',
    pattern: /(?:^|[;"\s])opacity\s*:/i,
    message: 'No opacity property — use rgba() color values instead',
  },
  {
    name: 'no-filter',
    pattern: /(?:^|;|\s)filter\s*:/i,
    message: 'No filter property — stripped by Canvas sanitizer',
  },
  {
    name: 'no-transform',
    pattern: /(?<![a-z-])transform\s*:/i,
    message: 'No transform property — stripped by Canvas sanitizer (text-transform is allowed)',
  },
  {
    name: 'no-transition',
    pattern: /(?:^|;|\s)transition\s*:/i,
    message: 'No transition property — stripped by Canvas sanitizer',
  },
  {
    name: 'no-animation',
    pattern: /(?:^|;|\s)animation\s*:/i,
    message: 'No animation property — stripped by Canvas sanitizer',
  },
  {
    name: 'no-h1',
    pattern: /<h1[\s>]/i,
    message: 'No <h1> tags — Canvas reserves H1 for the page title',
  },
];

export function validateCanvasHtml(html: string): ValidationResult {
  const violations: ValidationViolation[] = [];
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');

  for (const rule of RULES) {
    const match = stripped.match(rule.pattern);
    if (match) {
      violations.push({
        rule: rule.message,
        context: match[0].trim(),
      });
    }
  }

  const imgTags = stripped.match(/<img[^>]*>/gi) ?? [];
  for (const img of imgTags) {
    if (!/alt\s*=/i.test(img)) {
      violations.push({
        rule: 'All <img> tags must have an alt="" attribute',
        context: img.substring(0, 60) + '...',
      });
    }
  }

  return { valid: violations.length === 0, violations };
}
