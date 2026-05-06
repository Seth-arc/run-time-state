"""Generate episode.mp3 for each post via edge-tts.

Reads window.__TTS_TEXT from each posts/<slug>/index.html and writes
episodes/<slug>/episode.mp3 using the Emma neural voice.
"""

import asyncio
import codecs
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
EPISODES_DIR = ROOT / "episodes"
VOICE = "en-US-EmmaNeural"

TTS_PATTERN = re.compile(
    r'window\.__TTS_TEXT\s*=\s*"((?:[^"\\]|\\.)*)"',
    re.DOTALL,
)


def extract_tts_text(html_path: Path) -> str | None:
    html = html_path.read_text(encoding="utf-8")
    m = TTS_PATTERN.search(html)
    if not m:
        return None
    raw = m.group(1)
    return codecs.decode(raw, "unicode_escape")


async def render(slug: str, text: str) -> None:
    out_dir = EPISODES_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "episode.mp3"
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(str(out_path))
    size_kb = out_path.stat().st_size / 1024
    print(f"  -> {out_path.relative_to(ROOT)} ({size_kb:.0f} KB)")


async def main() -> int:
    only = set(sys.argv[1:])
    posts = sorted(POSTS_DIR.iterdir()) if POSTS_DIR.exists() else []
    if not posts:
        print("No posts found.")
        return 1

    rendered = 0
    for post_dir in posts:
        if not post_dir.is_dir():
            continue
        slug = post_dir.name
        if only and slug not in only:
            continue
        index = post_dir / "index.html"
        if not index.exists():
            continue
        text = extract_tts_text(index)
        if not text:
            print(f"[skip] {slug}: no __TTS_TEXT found")
            continue
        print(f"[render] {slug} ({len(text):,} chars)")
        await render(slug, text)
        rendered += 1

    print(f"\nDone. Rendered {rendered} episode(s).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
