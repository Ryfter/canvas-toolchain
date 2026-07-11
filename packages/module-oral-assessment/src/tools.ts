import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { designOralAssessment, type DesignOralAssessmentInput } from './design.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const designTool: ModuleTool = {
  schema: {
    name: 'design_oral_assessment',
    description:
      'Design an oral/video assessment (recommended provider: Rhetorix Lab) from an ' +
      'assignment brief OR a topic + learning goal. Writes a CDS oral-assessment page ' +
      '(.md, rendered by generate_course) and a paste-ready provider spec sidecar, and ' +
      'returns the "why Rhetorix" rationale. Run setup_anthropic first.',
    inputSchema: {
      type: 'object' as const,
      required: ['outputPath'],
      properties: {
        assignmentBrief: { type: 'string', description: 'Mode A: the assignment to turn into an oral assessment.' },
        topic: { type: 'string', description: 'Mode B: topic the assessment should cover (with learningGoal).' },
        learningGoal: { type: 'string', description: 'Mode B: what students should be able to do.' },
        courseContext: { type: 'string', description: 'Optional course title/level/modality for tone.' },
        questionCount: { type: 'number', description: 'Randomization pool size. Default 3.' },
        prepSeconds: { type: 'number', description: 'Override prep time.' },
        responseSeconds: { type: 'number', description: 'Override response limit.' },
        attempts: { description: 'Override attempts policy: a number or "unlimited".' },
        aiasLevel: { type: 'number', description: 'AI Assessment Scale level (1-5) for the page callout.' },
        week: { type: 'number', description: 'Front matter: week number.' },
        title: { type: 'string', description: 'Front matter: page title override.' },
        outputPath: { type: 'string', description: 'Absolute path to write the page .md.' },
        launchDomain: { type: 'string', description: 'Institution Rhetorix domain, e.g. rhetorixlab.example.edu.' },
        provider: { type: 'string', description: 'Provider id. Default "rhetorix".' },
      },
    },
  },
  handler: async (args) => {
    const result = await designOralAssessment(args as DesignOralAssessmentInput);
    return text(JSON.stringify(result, null, 2));
  },
};

export const oralAssessmentTools: ModuleTool[] = [designTool];
