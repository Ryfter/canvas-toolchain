// packages/command-and-control/src/tools/workflows/reembed_course_index.ts

import { setupLectureAnswers } from './setup_lecture_answers.js';
import { indexCourseForAnswers, type IndexCourseForAnswersResult } from './index_course_for_answers.js';
import type { EmbeddingProviderKind } from '../answers/types.js';

export interface ReembedCourseIndexInput {
  courseId: number;
  courseDir: string;
  provider?: EmbeddingProviderKind;
  voyageApiKey?: string;
  ollamaBaseUrl?: string;
  transcriptSources?: string[];
}

export async function reembedCourseIndex(
  input: ReembedCourseIndexInput,
): Promise<IndexCourseForAnswersResult> {
  if (input.provider) {
    const setup = await setupLectureAnswers({
      provider: input.provider,
      voyageApiKey: input.voyageApiKey,
      ollamaBaseUrl: input.ollamaBaseUrl,
    });
    if (!setup.configured) {
      throw new Error(setup.message ?? 'setup_lecture_answers failed during reembed_course_index');
    }
  }
  return indexCourseForAnswers({
    courseId: input.courseId, courseDir: input.courseDir,
    transcriptSources: input.transcriptSources, rebuild: true,
  });
}
