export interface WizardDefaults {
  institution?: string;
  brandUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  canvasUrl?: string;
  apiToken?: string;
  professorEmail?: string;
  favoriteCourses?: string;
  panoptoDomain?: string;
  panoptoClientId?: string;
  panoptoClientSecret?: string;
  philosophyAnswers?: string[];
}

function isBlank(v: string): boolean {
  return !v.trim() || /^_+$/.test(v.trim());
}

function extractYourAnswer(sectionText: string): string | undefined {
  const match = sectionText.match(/Your answer[^:]*:\s*(.+)/);
  if (!match) return undefined;
  const value = match[1].trim();
  return isBlank(value) ? undefined : value;
}

function extractLabeledField(sectionText: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}:\\s*(.+)`);
  const match = sectionText.match(regex);
  if (!match) return undefined;
  const value = match[1].trim();
  return isBlank(value) ? undefined : value;
}

function extractPhilosophyAnswers(sectionText: string): string[] | undefined {
  const matches = [...sectionText.matchAll(/Your answer[^:]*:\s*(.+)/g)];
  if (matches.length === 0) return undefined;
  let hasAny = false;
  const answers = matches.map(m => {
    const value = m[1].trim();
    const answer = isBlank(value) ? '' : value;
    if (answer) hasAny = true;
    return answer;
  });
  return hasAny ? answers : undefined;
}

export function parseWorksheet(content: string): WizardDefaults {
  const defaults: WizardDefaults = {};
  const sections = content.split(/^## /m);

  for (const section of sections) {
    const heading = section.split('\n')[0].trim();

    if (heading.startsWith('Brand Standards')) {
      const v = extractYourAnswer(section);
      if (v) defaults.brandUrl = v;
    } else if (heading === 'Institution Name') {
      const v = extractYourAnswer(section);
      if (v) defaults.institution = v;
    } else if (heading === 'Primary Brand Color') {
      const v = extractYourAnswer(section);
      if (v) defaults.primaryColor = v;
    } else if (heading.startsWith('Secondary')) {
      const v = extractYourAnswer(section);
      if (v) defaults.secondaryColor = v;
    } else if (heading === 'Canvas Base URL') {
      const v = extractYourAnswer(section);
      if (v) defaults.canvasUrl = v;
    } else if (heading.startsWith('Canvas API Token')) {
      const v = extractYourAnswer(section);
      if (v) defaults.apiToken = v;
    } else if (heading.startsWith('Professor Email')) {
      const v = extractYourAnswer(section);
      if (v) defaults.professorEmail = v;
    } else if (heading.startsWith('Favorite Canvas Course')) {
      const v = extractYourAnswer(section);
      if (v) defaults.favoriteCourses = v;
    } else if (heading.startsWith('Panopto Domain')) {
      const v = extractYourAnswer(section);
      if (v) defaults.panoptoDomain = v;
    } else if (heading.startsWith('Panopto API Client')) {
      const clientId = extractLabeledField(section, 'Client ID');
      const clientSecret = extractLabeledField(section, 'Client Secret');
      if (clientId) defaults.panoptoClientId = clientId;
      if (clientSecret) defaults.panoptoClientSecret = clientSecret;
    } else if (heading.startsWith('Teaching Philosophy')) {
      const answers = extractPhilosophyAnswers(section);
      if (answers) defaults.philosophyAnswers = answers;
    }
  }

  return defaults;
}

export function validateWorksheet(defaults: WizardDefaults): string[] {
  const errors: string[] = [];
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;

  if (defaults.primaryColor !== undefined && !hexRegex.test(defaults.primaryColor)) {
    errors.push(
      `Primary color "${defaults.primaryColor}" is not a valid 6-digit hex. Example: #0033A0`
    );
  }
  if (defaults.secondaryColor !== undefined && !hexRegex.test(defaults.secondaryColor)) {
    errors.push(
      `Secondary color "${defaults.secondaryColor}" is not a valid 6-digit hex. Example: #D64309`
    );
  }
  if (defaults.canvasUrl !== undefined && !defaults.canvasUrl.startsWith('https://')) {
    errors.push(
      `Canvas URL "${defaults.canvasUrl}" must start with https://. Example: https://boisestate.instructure.com`
    );
  }

  return errors;
}
