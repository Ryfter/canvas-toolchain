# Recommended Models for Canvas Toolchain (Bundled Fallback)

This is the offline fallback copy. The live version lives at
`docs/recommended-models.md` in the canvas-toolchain repo and is fetched
at setup time when network is available.

---

## General-Purpose Models — by VRAM Tier

For canvas-toolchain's built-in LLM features (brainstorming, rubric, answers
bot), pick one model that fits your hardware tier.

### Tier: 32 GB (RTX 5090, A6000)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:32b` | [Ollama](https://ollama.com/library/qwen2.5:32b) | Strong generalist at this tier | ~20 GB |

### Tier: 24 GB (RTX 4090, RTX 3090)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:14b` | [Ollama](https://ollama.com/library/qwen2.5:14b) | Strong reasoning at moderate VRAM | ~10 GB |

### Tier: 16 GB (RTX 4080, base M-series Mac)

<!-- Open a PR with your tested model -->

### Tier: 6 GB

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:3b` | [Ollama](https://ollama.com/library/qwen2.5:3b) | Fast on modest laptops | ~3 GB |

---

## Task-Specialized Models

Not wired into canvas-toolchain by default. Install if you have specific
workflows where a finetune beats a generalist.

### Whisper (Lecture Audio Transcription)

Will be consumed by sub-project 3 (Panopto Whisper comparison) when it ships.
