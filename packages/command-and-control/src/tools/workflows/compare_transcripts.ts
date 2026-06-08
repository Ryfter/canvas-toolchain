import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getTranscriptionEngine } from 'curriculum-intelligence-mcp/dist/transcription/faster_whisper_engine.js';
import {
  compareTranscripts,
  renderComparisonMd,
  type SuggestedCorrection,
} from 'curriculum-intelligence-mcp/dist/transcription/compare.js';
import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';
import { fetchSessionAudio, loadPanoptoConfig, loadPanoptoVocab } from '@canvas-toolchain/module-video';
import { loadTranscriptConfig } from '../setup_transcript_source.js';

interface SessionEntry {
  sessionId: string;
  title: string;
  startTime: string;
  duration: number;
  filename: string;
}

export interface CompareTranscriptsInput {
  transcriptsPath: string;
  sessionIds?: string[];
  model?: string;
  keepAudio?: boolean;
}

export interface CompareTranscriptsResult {
  transcriptsPath: string;
  reports: { sessionId: string; title: string; divergenceRate: number; mdPath: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  suggestedCorrections: SuggestedCorrection[];
  error?: string;
  setupSteps?: string[];
  fix?: string[];
}

function vttToWhisperVtt(cues: { startSec: number; endSec: number; text: string }[]): string {
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
  };
  const out = ['WEBVTT', ''];
  for (const c of cues) {
    out.push(`${fmt(c.startSec)} --> ${fmt(c.endSec)}`, c.text, '');
  }
  return out.join('\n');
}

export async function compareTranscriptsWorkflow(
  input: CompareTranscriptsInput,
): Promise<CompareTranscriptsResult> {
  const base: CompareTranscriptsResult = {
    transcriptsPath: input.transcriptsPath,
    reports: [],
    failed: [],
    suggestedCorrections: [],
  };

  const manifestPath = join(input.transcriptsPath, '_sessions.json');
  if (!existsSync(manifestPath)) {
    return { ...base, error: 'MANIFEST_NOT_FOUND', fix: ['Run bulk_fetch_panopto_transcripts first'] };
  }

  let panoptoConfig;
  try {
    panoptoConfig = loadPanoptoConfig();
  } catch {
    return { ...base, error: 'PANOPTO_NOT_CONFIGURED', fix: ['Run setup_panopto first'] };
  }

  const tconf = loadTranscriptConfig();
  const model = input.model ?? tconf.model;
  const engine = getTranscriptionEngine(tconf.engine);

  const status = await engine.isAvailable();
  if (!status.available) {
    return { ...base, error: 'ENGINE_UNAVAILABLE', setupSteps: status.setupSteps ?? [] };
  }

  const vocab = loadPanoptoVocab();
  const knownTerms = vocab.corrections.map((c) => c.to);
  const vocabHints = Array.from(new Set(knownTerms));

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { sessions: SessionEntry[] };
  const wanted = input.sessionIds
    ? manifest.sessions.filter((s) => input.sessionIds!.includes(s.sessionId))
    : manifest.sessions;

  const merged = new Map<string, SuggestedCorrection>();

  for (const session of wanted) {
    const vttPath = join(input.transcriptsPath, session.filename);
    if (!existsSync(vttPath)) {
      base.failed.push({ sessionId: session.sessionId, title: session.title, reason: 'VTT missing' });
      continue;
    }
    const audio = await fetchSessionAudio(session, panoptoConfig, input.transcriptsPath, tconf.audioMode);
    if (!audio.ok || !audio.path) {
      const reason = audio.manualInstructions ? audio.manualInstructions.join('\n') : 'audio unavailable';
      base.failed.push({ sessionId: session.sessionId, title: session.title, reason });
      continue;
    }
    try {
      const whisperCues = await engine.transcribe(audio.path, { model, language: 'en', vocabHints });
      const stem = session.filename.replace(/\.panopto\.vtt$/, '');
      writeFileSync(join(input.transcriptsPath, `${stem}.whisper.vtt`), vttToWhisperVtt(whisperCues), 'utf-8');

      const panoptoCues = parseVtt(readFileSync(vttPath, 'utf-8'));
      const report = compareTranscripts(panoptoCues, whisperCues, {
        knownTerms,
        fillerWords: vocab.fillerWords,
        domain: panoptoConfig.domain,
        sessionId: session.sessionId,
        title: session.title,
      });
      const mdPath = join(input.transcriptsPath, `${stem}.comparison.md`);
      writeFileSync(mdPath, renderComparisonMd(report), 'utf-8');

      base.reports.push({
        sessionId: session.sessionId,
        title: session.title,
        divergenceRate: report.divergenceRate,
        mdPath,
      });
      for (const s of report.suggestedCorrections) {
        const ex = merged.get(`${s.from} ${s.to}`);
        if (ex) ex.occurrences += s.occurrences;
        else merged.set(`${s.from} ${s.to}`, { ...s });
      }
    } catch (err) {
      base.failed.push({
        sessionId: session.sessionId,
        title: session.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!input.keepAudio && audio.source === 'panopto' && audio.path && existsSync(audio.path)) {
        rmSync(audio.path, { force: true });
      }
    }
  }

  base.suggestedCorrections = Array.from(merged.values()).sort((a, b) => b.occurrences - a.occurrences);
  return base;
}
