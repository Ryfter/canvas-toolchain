#!/usr/bin/env python3
"""faster-whisper bridge. Prints JSON cues to stdout, or a JSON error and exits non-zero."""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="medium")
    parser.add_argument("--language", default="en")
    parser.add_argument("--initial-prompt", default=None)
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "FASTER_WHISPER_NOT_INSTALLED"}), file=sys.stderr)
        return 2

    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(
            args.audio,
            language=args.language,
            initial_prompt=args.initial_prompt or None,
        )
        cues = [{"start": float(s.start), "end": float(s.end), "text": s.text.strip()} for s in segments]
        print(json.dumps(cues))
        return 0
    except Exception as exc:  # noqa: BLE001 — bridge surfaces any failure as JSON
        print(json.dumps({"error": "TRANSCRIBE_FAILED", "detail": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
