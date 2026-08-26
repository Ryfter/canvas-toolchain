/** Re-export for shell spot-check call-out / compose. */
export { validateQuiz, validateQuizForShell, type ValidateQuizInput, type ValidateQuizResult, type ValidateQuizDeps } from '../workflows/validate_quiz.js';
export { generateQuiz, type GenerateQuizInput, type GenerateQuizResult } from '../workflows/generate_quiz.js';
export type { QuizValidationReport, QuizFinding, LiveQuizPayload } from './types.js';
export { parseQuizDraft, renderQuizDraft } from './parse.js';
