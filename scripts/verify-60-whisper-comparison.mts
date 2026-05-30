/**
 * #60 verification driver — runs the real Whisper-vs-Panopto comparison on Kevin's
 * local Panopto folder. Bypasses bulk_fetch_panopto_transcripts (no API) and
 * fetchSessionAudio (audio is already local). Uses the production CI modules directly:
 *   - parseSrt (handles Panopto's SRT-shaped .txt export)
 *   - getTranscriptionEngine (faster-whisper Python bridge)
 *   - compareTranscripts + renderComparisonMd
 *
 * ffmpeg must be on PATH. Whisper model is downloaded on first run (~1.5GB for medium).
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseSrt } from '../packages/curriculum-intelligence/dist/parsers/transcript_srt.js';
import { getTranscriptionEngine } from '../packages/curriculum-intelligence/dist/transcription/faster_whisper_engine.js';
import {
  compareTranscripts,
  renderComparisonMd,
} from '../packages/curriculum-intelligence/dist/transcription/compare.js';

const PANOPTO_DIR = 'C:/Dev/Canvas Control/ITM310/Panopto';
const MODEL = process.env.WHISPER_MODEL ?? 'medium';
const FFMPEG =
  process.env.FFMPEG_PATH ??
  'C:/Users/krank/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';

function looksTimestamped(content: string): boolean {
  // A SRT-shaped file starts with "1\n00:HH:MM,mmm --> ..."
  return /^\s*\d+\s*\n\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->/.test(content);
}

console.log(`# #60 Whisper-vs-Panopto verification`);
console.log(`Folder: ${PANOPTO_DIR}`);
console.log(`Whisper model: ${MODEL}\n`);

const files = readdirSync(PANOPTO_DIR);
const videos = files.filter((f) => f.endsWith('.mp4'));

const sessions = videos.map((video) => {
  const base = video.replace(/_default\.mp4$/, '');
  const captions = files.filter((f) => f.startsWith(base) && f.endsWith('.txt'));
  const timestamped = captions.find((f) =>
    looksTimestamped(readFileSync(join(PANOPTO_DIR, f), 'utf-8')),
  );
  return { base, video, captionFile: timestamped };
});

console.log('## Sessions discovered\n');
for (const s of sessions) {
  console.log(`- **${s.base}**`);
  console.log(`  - video: \`${s.video}\` (${(statSync(join(PANOPTO_DIR, s.video)).size / 1e6).toFixed(1)} MB)`);
  console.log(`  - timestamped caption: ${s.captionFile ? `\`${s.captionFile}\`` : '⚠️ none found'}`);
}
console.log();

// 2. Engine availability check
const engine = getTranscriptionEngine('faster-whisper');
console.log('## Engine probe\n');
const status = await engine.isAvailable();
console.log(`- name: ${engine.name}`);
console.log(`- available: ${status.available}`);
console.log(`- detail: ${status.detail}`);
if (status.setupSteps) {
  console.log(`- setupSteps:`);
  for (const step of status.setupSteps) console.log(`    - ${step}`);
}
console.log();
if (!status.available) {
  // The engine's isAvailable also gates on ffmpeg-on-PATH; we use FFMPEG var instead
  // and let faster_whisper handle audio decode via pyav. Proceed unless it's a Python/dep issue.
  const ffmpegPathIssue = /ffmpeg.*PATH/i.test(status.detail);
  if (!ffmpegPathIssue) {
    console.error('Engine unavailable — cannot proceed.');
    process.exit(1);
  }
  console.log('  (ignoring ffmpeg-on-PATH gate; script uses absolute FFMPEG path)\n');
}

// 3. Pipeline per session
const aggregateSuggestions: Array<{ session: string; from: string; to: string; count: number }> = [];

for (const s of sessions) {
  if (!s.captionFile) {
    console.log(`### ${s.base} — SKIPPED (no timestamped caption)\n`);
    continue;
  }
  console.log(`## ${s.base}\n`);

  // Parse Panopto SRT
  const panoptoCues = parseSrt(readFileSync(join(PANOPTO_DIR, s.captionFile), 'utf-8'));
  console.log(`- Panopto cues parsed: ${panoptoCues.length}`);
  const panoptoDuration = panoptoCues.length > 0 ? panoptoCues[panoptoCues.length - 1].endSec : 0;
  console.log(`- Panopto duration: ${(panoptoDuration / 60).toFixed(1)} min`);

  // Extract audio with ffmpeg
  const audioPath = join(PANOPTO_DIR, s.video.replace(/\.mp4$/, '.mp3'));
  console.log(`- Extracting audio → ${audioPath}`);
  const ffmpegStart = Date.now();
  execFileSync(
    FFMPEG,
    ['-y', '-i', join(PANOPTO_DIR, s.video), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audioPath],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  console.log(`- ffmpeg done in ${((Date.now() - ffmpegStart) / 1000).toFixed(1)}s`);

  // Run Whisper
  console.log(`- Running faster-whisper (model=${MODEL}, language=en) — this may take several minutes...`);
  const whisperStart = Date.now();
  const whisperCues = await engine.transcribe(audioPath, { model: MODEL, language: 'en' });
  const whisperSec = (Date.now() - whisperStart) / 1000;
  console.log(`- Whisper done in ${whisperSec.toFixed(1)}s — ${whisperCues.length} cues`);

  // Write Whisper VTT for the record
  const whisperVttPath = join(PANOPTO_DIR, `${s.base}.whisper.vtt`);
  const vtt =
    'WEBVTT\n\n' +
    whisperCues
      .map((c, i) => `${i + 1}\n${fmtVtt(c.startSec)} --> ${fmtVtt(c.endSec)}\n${c.text}\n`)
      .join('\n');
  writeFileSync(whisperVttPath, vtt, 'utf-8');
  console.log(`- Wrote ${whisperVttPath}`);

  // Compare
  const report = compareTranscripts(panoptoCues, whisperCues, {
    knownTerms: [],
    fillerWords: ['uh', 'um', 'you know', 'kind of', 'sort of', 'basically', 'like'],
    domain: '',
    sessionId: s.base,
    title: s.base,
  });

  console.log(`- Divergence rate: ${(report.divergenceRate * 100).toFixed(1)}%`);
  console.log(`- Total disagreements: ${report.totalDisagreements}`);
  console.log(`- Likely-vocab disagreements (score >= 70): ${report.likelyVocabCount}`);
  console.log(`- Suggested corrections: ${report.suggestedCorrections.length}`);

  // Write markdown
  const mdPath = join(PANOPTO_DIR, `${s.base}.comparison.md`);
  writeFileSync(mdPath, renderComparisonMd(report), 'utf-8');
  console.log(`- Wrote ${mdPath}`);

  // Top suggestions inline
  if (report.suggestedCorrections.length > 0) {
    console.log(`\nTop suggested corrections (this session):`);
    for (const c of report.suggestedCorrections.slice(0, 10)) {
      console.log(`  "${c.from}" → "${c.to}"  (occurrences=${c.occurrences})`);
      aggregateSuggestions.push({ session: s.base, from: c.from, to: c.to, count: c.occurrences });
    }
  }
  console.log();
}

// 4. Cross-session aggregate
if (aggregateSuggestions.length > 0) {
  // Bucket by from→to across sessions
  const buckets = new Map<string, { from: string; to: string; total: number; sessions: Set<string> }>();
  for (const s of aggregateSuggestions) {
    const k = `${s.from}→${s.to}`;
    const b = buckets.get(k) ?? { from: s.from, to: s.to, total: 0, sessions: new Set() };
    b.total += s.count;
    b.sessions.add(s.session);
    buckets.set(k, b);
  }
  console.log('## Aggregate corrections across both sessions\n');
  const ranked = [...buckets.values()].sort((a, b) => b.total - a.total);
  for (const b of ranked.slice(0, 20)) {
    console.log(`  "${b.from}" → "${b.to}"  (total=${b.total}, in ${b.sessions.size} session(s))`);
  }
}

console.log('\nDone.');

function fmtVtt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad(h)}:${pad(m)}:${s.toFixed(3).padStart(6, '0')}`;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
