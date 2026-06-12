import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { AssessmentSpec, AttemptsPolicy } from './provider.js';
import { resolveActiveOralAssessmentProvider } from './resolve.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { renderOralAssessmentMarkdown } from './render_md.js';
import { makeAnthropicLlm } from './llm.js';

export interface DesignOralAssessmentInput {
  assignmentBrief?: string;
  topic?: string;
  learningGoal?: string;
  courseContext?: string;
  questionCount?: number;
  prepSeconds?: number;
  responseSeconds?: number;
  attempts?: AttemptsPolicy;
  aiasLevel?: number;
  week?: number;
  title?: string;
  outputPath: string;
  launchDomain?: string;
  provider?: string;
}

export interface DesignOralAssessmentHooks {
  llm?: LlmClient;
}

export interface DesignOralAssessmentResult {
  pagePath: string;
  specPath: string;
  providerSpec: string;
  recommendation: string;
  questionCount: number;
  usage?: { inputTokens: number; outputTokens: number };
}

interface LlmAssessmentFields {
  title: string;
  promptSummary: string;
  questions: Array<{ prompt: string }>;
  rubricCriteria: Array<{ name: string; description: string; points: number }>;
}

function parseFields(text: string): LlmAssessmentFields {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const obj = JSON.parse(trimmed) as LlmAssessmentFields;
  if (!Array.isArray(obj.questions) || !Array.isArray(obj.rubricCriteria)) {
    throw new Error('LLM response missing questions/rubricCriteria.');
  }
  return obj;
}

export async function designOralAssessment(
  input: DesignOralAssessmentInput,
  hooks: DesignOralAssessmentHooks = {},
): Promise<DesignOralAssessmentResult> {
  const hasBrief = Boolean(input.assignmentBrief && input.assignmentBrief.trim());
  const hasTopic = Boolean(input.topic && input.learningGoal);
  if (!hasBrief && !hasTopic) {
    throw new Error('Provide either assignmentBrief, or topic + learningGoal.');
  }

  const provider = resolveActiveOralAssessmentProvider(input.provider);
  const intent = input.assignmentBrief ?? `${input.topic ?? ''} ${input.learningGoal ?? ''}`;
  const defaults = provider.defaults(intent);

  const llm = hooks.llm ?? makeAnthropicLlm();
  const response = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(input), { maxTokens: 2048 });
  const fields = parseFields(response.text);

  const spec: AssessmentSpec = {
    title: input.title ?? fields.title,
    promptSummary: fields.promptSummary,
    questions: fields.questions,
    prepSeconds: input.prepSeconds ?? defaults.prepSeconds,
    responseSeconds: input.responseSeconds ?? defaults.responseSeconds,
    randomization: { pick: defaults.randomization.pick, of: input.questionCount ?? fields.questions.length },
    attempts: input.attempts ?? defaults.attempts,
    rubricCriteria: fields.rubricCriteria,
  };

  const launchUrl = provider.buildLaunchUrl(input.launchDomain);
  const md = renderOralAssessmentMarkdown(spec, {
    week: input.week,
    title: input.title,
    launchUrl,
    aiasLevel: input.aiasLevel,
  });

  const pagePath = resolve(input.outputPath);
  mkdirSync(dirname(pagePath), { recursive: true });
  if (existsSync(pagePath)) copyFileSync(pagePath, `${pagePath}.bak`);
  writeFileSync(pagePath, md, 'utf-8');

  const providerSpec = provider.formatAssessment(spec);
  const base = basename(pagePath).replace(/\.md$/, '');
  const specPath = join(dirname(pagePath), `${base}.${provider.id}.md`);
  writeFileSync(specPath, providerSpec, 'utf-8');

  return {
    pagePath,
    specPath,
    providerSpec,
    recommendation: provider.recommendation(),
    questionCount: spec.questions.length,
    usage: response.usage,
  };
}
