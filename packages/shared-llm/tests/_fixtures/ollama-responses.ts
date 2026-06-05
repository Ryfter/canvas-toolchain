export const OLLAMA_GENERATE_OK = {
  model: 'qwen2.5:14b',
  created_at: '2026-06-05T16:00:00Z',
  response: 'hello world',
  done: true,
  prompt_eval_count: 12,
  eval_count: 4,
};

export const OLLAMA_TAGS_OK = {
  models: [
    { name: 'qwen2.5:14b', size: 9000000000, modified_at: '2026-06-01T00:00:00Z' },
    { name: 'llama3.1:8b', size: 4500000000, modified_at: '2026-06-01T00:00:00Z' },
  ],
};
