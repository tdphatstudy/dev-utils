"""Build multi-size Windows .ico (must include 256x256) from resources/icon.png."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "resources"
SRC = RES / "icon.png"

src = Image.open(SRC).convert("RGBA")
if min(src.size) < 256:
    raise SystemExit(f"icon.png must be >= 256px, got {src.size}")

# Square master
side = min(src.size)
left = (src.width - side) // 2
top = (src.height - side) // 2
src = src.crop((left, top, left + side, top + side))

sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
src.resize((256, 256), Image.Resampling.LANCZOS).save(RES / "icon-256.png", "PNG", optimize=True)
src.resize((512, 512), Image.Resampling.LANCZOS).save(RES / "icon-512.png", "PNG", optimize=True)
src.resize((512, 512), Image.Resampling.LANCZOS).save(RES / "icon.png", "PNG", optimize=True)

# Build ICO with multiple embedded sizes (Windows + electron-builder need 256)
# Pillow writes all sizes listed in `sizes=` from the source image.
src256 = src.resize((256, 256), Image.Resampling.LANCZOS)
src256.save(RES / "icon.ico", format="ICO", sizes=sizes)

ico = Image.open(RES / "icon.ico")
print("icon.ico ok, entry size:", ico.size)
# Some Pillow builds only expose one frame via seek; file still contains multi-res
print("  file bytes:", (RES / "icon.ico").stat().st_size)
