# Recommended Models for Canvas Toolchain

This page is fetched by the toolchain at setup time. The toolchain does NOT
parse it — it returns the contents verbatim to the user, who picks a model
ID and re-runs `setup_ollama --model <id>`.

To update: edit this file directly. Changes propagate within 24 h (cache
TTL) for every installed copy of canvas-toolchain.

---

## General-Purpose Models — by VRAM Tier

For canvas-toolchain's built-in LLM features (brainstorming, rubric, answers
bot), pick **one** model that fits your hardware tier.

### Tier: 32 GB (RTX 5090, A6000)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:32b` | [Ollama](https://ollama.com/library/qwen2.5:32b) · [HF](https://huggingface.co/Qwen/Qwen2.5-32B-Instruct) | Strongest generalist at this tier — top reasoning and instruction-following | ~20 GB |

### Tier: 24 GB (RTX 4090, RTX 3090)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:14b` | [Ollama](https://ollama.com/library/qwen2.5:14b) · [HF](https://huggingface.co/Qwen/Qwen2.5-14B-Instruct) | Strong reasoning at moderate VRAM; good citation discipline for the answers bot | ~10 GB |

### Tier: 16 GB (RTX 4080, base M-series Mac)

<!-- Open a PR with your tested model -->

### Tier: 6 GB

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:3b` | [Ollama](https://ollama.com/library/qwen2.5:3b) · [HF](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct) | Fast on modest laptops; adequate for brainstorm and rubric rewriting | ~3 GB |

---

## Task-Specialized Models

Not wired into canvas-toolchain's built-in features. Install if you have
specific workflows where a finetune beats a generalist.

### Git Commit Messages

| Model | URL | Why | VRAM |
|---|---|---|---|
| `tavernari/git-commit-message` | [Ollama](https://ollama.com/tavernari/git-commit-message) | Finetuned for Conventional Commits | ~4 GB |

### OCR (Document Parsing)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `deepseek-ocr` | [HF](https://huggingface.co/deepseek-ai) | Strong OCR for slide PDFs and scanned course materials | ~6 GB |

### Whisper (Lecture Audio Transcription)

Used by sub-project 3 (Panopto Whisper comparison) when it ships.

| Model | URL | Why | VRAM |
|---|---|---|---|
| `whisper.cpp small.en` | [HF](https://huggingface.co/openai/whisper-small) | Best speed / quality balance for English-only courses | ~2 GB |
