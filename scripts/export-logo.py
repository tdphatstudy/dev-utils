"""Export logo master with proper squircle alpha (no white corners)."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

# Symbol mark: stacked liquid-glass modules (toolkit) — no letter monogram
SRC = Path(
    r"C:\Users\tdpha\.grok\sessions\C%3A%5CUsers%5Ctdpha%5CDocuments%5Cpersonal%5CDevUtils"
    r"\019f981e-cb09-7012-b051-cb5fc16c6528\images\13.jpg"
)
ROOT = Path(r"C:\Users\tdpha\Documents\personal\DevUtils")

# Continuous-corner exponent ≈ Apple icon mask
SUPERELLIPSE_N = 5.0
# Corner radius as fraction of half-side (Apple ~0.55 of half for continuous corner feel)
# Using classic iOS continuous corner via superellipse inscribed in unit square.


def squircle_mask(size: int) -> Image.Image:
    """Alpha mask: opaque inside Apple-like continuous corner, transparent outside."""
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    assert px is not None
    c = (size - 1) / 2.0
    # Slight inset so antialias edge stays inside
    r = c * 0.995
    n = SUPERELLIPSE_N
    for y in range(size):
        for x in range(size):
            nx = abs(x - c) / r
            ny = abs(y - c) / r
            if nx > 1.05 or ny > 1.05:
                continue
            v = nx**n + ny**n
            if v <= 0.92:
                px[x, y] = 255
            elif v <= 1.0:
                # soft edge
                t = (1.0 - v) / 0.08
                px[x, y] = max(0, min(255, int(255 * t)))
    # Slight blur for cleaner AA
    return mask.filter(ImageFilter.GaussianBlur(radius=size / 512))


def apply_squircle(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    size = im.size[0]
    mask = squircle_mask(size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    out.putalpha(mask)
    return out


def save_png(im: Image.Image, path: Path, size: int | None = None) -> None:
    out = im.copy()
    if size and out.size[0] != size:
        out = out.resize((size, size), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, "PNG", optimize=True)
    print(f"wrote {path} {out.size}")


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((1024, 1024), Image.Resampling.LANCZOS)
    img = apply_squircle(img)

    save_png(img, ROOT / "src" / "renderer" / "src" / "assets" / "logo.png", 1024)
    save_png(img, ROOT / "src" / "renderer" / "src" / "assets" / "logo-fullbleed.png", 1024)
    save_png(img, ROOT / "src" / "renderer" / "public" / "logo.png", 1024)
    save_png(img, ROOT / "src" / "renderer" / "public" / "favicon.png", 256)
    save_png(img, ROOT / "resources" / "icon.png", 512)
    save_png(img, ROOT / "resources" / "icon-512.png", 512)
    save_png(img, ROOT / "resources" / "icon-256.png", 256)

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_imgs = [img.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    ico_path = ROOT / "resources" / "icon.ico"
    ico_imgs[0].save(ico_path, format="ICO", sizes=ico_sizes, append_images=ico_imgs[1:])
    print(f"wrote {ico_path}")
    print("done")


if __name__ == "__main__":
    main()
