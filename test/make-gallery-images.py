"""Generate disposable JPEG and WebP fixtures (requires Pillow)."""

import random
import sys
from pathlib import Path

from PIL import Image

output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
random_bytes = random.Random(42)
for index, (width, height) in enumerate([(2100, 1550), (2900, 2200), (3550, 2500)]):
    source = Image.frombytes("L", (width, height), random_bytes.randbytes(width * height))
    original = output / f"{index}.jpg"
    thumb = output / f"{index}.webp"
    source.save(original, quality=96)
    source.resize((400, round(400 * height / width)), Image.Resampling.LANCZOS).save(thumb, quality=78)
    print(f"{width}x{height}: {original.stat().st_size:,} JPEG bytes -> {thumb.stat().st_size:,} WebP bytes")
