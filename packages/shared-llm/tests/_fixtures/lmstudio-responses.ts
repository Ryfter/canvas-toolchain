export const LMSTUDIO_CHAT_OK = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  model: 'qwen2.5-14b-instruct',
  choices: [
    { index: 0, message: { role: 'assistant', content: 'hello world' }, finish_reason: 'stop' },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
};

export const LMSTUDIO_MODELS_OK = {
  object: 'list',
  data: [
    { id: 'qwen2.5-14b-instruct', object: 'model' },
    { id: 'llama-3.1-8b-instruct', object: 'model' },
  ],
};
