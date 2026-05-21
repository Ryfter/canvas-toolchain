#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { CI_TOOLS } from './passthrough/ci_tools.js';
import { DOWNLOADER_TOOLS, downloadCanvasArchive, type DownloadCanvasArchiveInput } from './passthrough/downloader_tools.js';
import { DESIGN_TOOLS } from './passthrough/design_tools.js';
import { setupCc } from './tools/setup_cc.js';
import { getCcStatus } from './tools/get_cc_status.js';
import { analyzeCourse } from './tools/workflows/analyze_course.js';
import { planNextSemester } from './tools/workflows/plan_next_semester.js';
import { updateCourseMaterials } from './tools/workflows/update_course_materials.js';
import { fullPipeline } from './tools/workflows/full_pipeline.js';
import { installResource } from './registry/install_resource.js';
import { listInstalledResources, uninstallResource } from './registry/local_registry.js';

const ALL_PASSTHROUGH = [...CI_TOOLS, ...DOWNLOADER_TOOLS, ...DESIGN_TOOLS];

const server = new Server(
  { name: 'command-and-control', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Observability & config ──────────────────────────────────────────────
    {
      name: 'setup_cc',
      description: 'Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          mode: { type: 'string', enum: ['easy', 'advanced'] },
          anthropicModel: { type: 'string', description: 'Anthropic model name, e.g. "claude-sonnet-4-6".' },
          ollamaBaseUrl: { type: 'string', description: 'Ollama server URL, e.g. "http://localhost:11434".' },
          ollamaModel: { type: 'string', description: 'Ollama model name, e.g. "llama3.2".' },
          routingFast: { type: 'string', enum: ['anthropic', 'ollama'] },
          routingJudgment: { type: 'string', enum: ['anthropic', 'ollama'] },
          downloaderPath: { type: 'string', description: 'Absolute path to the canvas-backup executable (or canvas-backup.exe). Persisted in config — professors set this once instead of managing env vars.' },
          registryToken: { type: 'string', description: 'Premium registry token for ryfter:// resources. Stored locally and never echoed back.' },
          premiumRegistryBaseUrl: { type: 'string', description: 'Optional premium registry API base URL override.' },
        },
      },
    },
    {
      name: 'get_cc_status',
      description: 'Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    // ── High-level workflows ────────────────────────────────────────────────
    {
      name: 'analyze_course',
      description: 'Answer "how stale is my course?" — ingests the Canvas archive, scores topic currency, and generates KEEP/UPDATE/DROP/ADD verdicts in one step.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
        },
      },
    },
    {
      name: 'plan_next_semester',
      description: 'Answer "get me ready to plan next semester" — imports previous shell, fetches the academic calendar, shifts all due dates, and generates a recommended outline.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          semesterPattern: { type: 'string', description: 'Semester ID used for calendar inference, e.g. "Fall2026".' },
          calendarUrl: { type: 'string' },
          manualDates: { type: 'object' },
          onBreakCollision: { type: 'string', enum: ['flag', 'bump-before', 'bump-after'] },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'update_course_materials',
      description: 'Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          outputPath: { type: 'string' },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'full_pipeline',
      description: 'Run analyze_course → plan_next_semester → update_course_materials end-to-end. Returns results from all three phases.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          archivePath: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          semesterPattern: { type: 'string' },
          calendarUrl: { type: 'string' },
          manualDates: { type: 'object' },
          onBreakCollision: { type: 'string', enum: ['flag', 'bump-before', 'bump-after'] },
          sections: { type: 'array', items: { type: 'string' } },
          outputPath: { type: 'string' },
        },
      },
    },
    // ── Resource registry ──────────────────────────────────────────────────
    {
      name: 'install_resource',
      description: 'Install a template, theme, prompt, or adapter-config resource from github://, ryfter://, or file:// into the local registry.',
      inputSchema: {
        type: 'object' as const,
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Resource URL, e.g. github://canvas-toolchain/templates/comparison-layout-academic@1.2.0' },
        },
      },
    },
    {
      name: 'list_installed_resources',
      description: 'List resources installed in the local registry, optionally filtered by kind.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          kind: { type: 'string', enum: ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] },
        },
      },
    },
    {
      name: 'uninstall_resource',
      description: 'Remove a resource from the local registry by kind and id. Bundle entries also remove their included resources.',
      inputSchema: {
        type: 'object' as const,
        required: ['kind', 'id'],
        properties: {
          kind: { type: 'string', enum: ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] },
          id: { type: 'string' },
          version: { type: 'string', description: 'Optional version. When omitted, all installed versions for the kind/id are removed.' },
        },
      },
    },
    // ── Pass-through tools ──────────────────────────────────────────────────
    ...ALL_PASSTHROUGH.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'setup_cc':
        result = setupCc(args as Parameters<typeof setupCc>[0]);
        break;
      case 'get_cc_status':
        result = await getCcStatus();
        break;
      case 'analyze_course':
        result = await analyzeCourse(args as unknown as Parameters<typeof analyzeCourse>[0]);
        break;
      case 'plan_next_semester':
        result = await planNextSemester(args as unknown as Parameters<typeof planNextSemester>[0]);
        break;
      case 'update_course_materials':
        result = await updateCourseMaterials(args as unknown as Parameters<typeof updateCourseMaterials>[0]);
        break;
      case 'full_pipeline':
        result = await fullPipeline(args as unknown as Parameters<typeof fullPipeline>[0]);
        break;
      case 'install_resource':
        result = await installResource(args as unknown as Parameters<typeof installResource>[0]);
        break;
      case 'list_installed_resources':
        result = listInstalledResources(args as unknown as Parameters<typeof listInstalledResources>[0]);
        break;
      case 'uninstall_resource':
        result = uninstallResource(args as unknown as Parameters<typeof uninstallResource>[0]);
        break;
      case 'download_canvas_archive': {
        // Special-cased so we can forward Canvas Backup's per-download progress events
        // to the MCP client via notifications/progress when a progressToken is provided.
        const progressToken = extra._meta?.progressToken;
        let progressCount = 0;
        const onProgress = progressToken != null
          ? (message: string) => {
              progressCount++;
              void extra.sendNotification({
                method: 'notifications/progress',
                params: { progressToken, progress: progressCount, message },
              });
            }
          : undefined;
        result = await downloadCanvasArchive(args as unknown as DownloadCanvasArchiveInput, onProgress);
        break;
      }
      default: {
        const tool = ALL_PASSTHROUGH.find((t) => t.name === name);
        if (!tool) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
        }
        result = await Promise.resolve(tool.handler(args));
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
