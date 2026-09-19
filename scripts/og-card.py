"""Draw a 1200x630 link-preview card for a resource page.

Usage:
    python scripts/og-card.py ghost "Ghost: set your phone location anywhere" \
        "Free, open-source app for Mac and Windows. Set your phone's location, no jailbreak." \
        --eyebrow "GHOST · FROM THE REEL" --badge "Free & open source on GitHub" \
        --out assets/img/og/ghost-2026-09-19.png

Only Pillow and the Windows system fonts (Georgia, Segoe UI) are needed.
The palette mirrors the home page (styles.css) so the card matches the site.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
INK = (33, 29, 24)
MUTED = (108, 100, 87)
TEAL = (224, 80, 45)          # tomato accent, the page's --accent
TEAL_PALE = (241, 234, 221)   # paper
PAPER = (255, 253, 247)
WASH = (241, 234, 221)
LINE = (217, 207, 186)
GLOW = (233, 224, 207)

FONT_DIR = Path("C:/Windows/Fonts")


def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / name), size)


def wrap(draw, text, fnt, max_width):
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_phone(img, x, y, scale=1.0):
    """A simple phone with a map and a location pin, in the page's teal."""
    d = ImageDraw.Draw(img)
    pw, ph = int(210 * scale), int(420 * scale)
    r = int(36 * scale)
    d.rounded_rectangle([x, y, x + pw, y + ph], radius=r, fill=INK)
    inset = int(12 * scale)
    d.rounded_rectangle(
        [x + inset, y + inset, x + pw - inset, y + ph - inset],
        radius=r - inset,
        fill=TEAL_PALE,
    )
    # map roads
    road = LINE
    for i in range(1, 5):
        yy = y + inset + int(i * (ph - 2 * inset) / 5)
        d.line([x + inset, yy, x + pw - inset, yy], fill=road, width=int(6 * scale))
    for i in range(1, 3):
        xx = x + inset + int(i * (pw - 2 * inset) / 3)
        d.line([xx, y + inset, xx, y + ph - inset], fill=road, width=int(6 * scale))
    # pin
    cx, cy = x + pw // 2, y + ph // 2 - int(20 * scale)
    pr = int(34 * scale)
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=TEAL)
    d.polygon([(cx - pr + int(6 * scale), cy + int(10 * scale)),
               (cx + pr - int(6 * scale), cy + int(10 * scale)),
               (cx, cy + pr + int(34 * scale))], fill=TEAL)
    ir = int(13 * scale)
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=PAPER)
    # notch
    d.rounded_rectangle(
        [cx - int(40 * scale), y + int(18 * scale), cx + int(40 * scale), y + int(30 * scale)],
        radius=int(6 * scale), fill=INK,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("title")
    ap.add_argument("summary")
    ap.add_argument("--eyebrow", default="FROM THE REEL")
    ap.add_argument("--badge", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    img = Image.new("RGB", (W, H), WASH)
    d = ImageDraw.Draw(img)

    # soft teal glow top-right, like the page hero
    glow = Image.new("RGB", (W, H), WASH)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 520, -260, W + 200, 420], fill=GLOW)
    img = Image.blend(img, glow, 0.85)
    d = ImageDraw.Draw(img)

    # card
    d.rounded_rectangle([40, 40, W - 40, H - 40], radius=40, fill=PAPER, outline=LINE, width=2)

    # brand
    d.ellipse([84, 78, 128, 122], fill=TEAL)
    d.text((106, 100), "D", font=font("segoeuib.ttf", 26), fill=PAPER, anchor="mm")
    d.text((142, 100), "Deon Menezes", font=font("seguisb.ttf", 26), fill=INK, anchor="lm")

    # eyebrow
    d.text((84, 178), a.eyebrow.upper(), font=font("segoeuib.ttf", 22), fill=TEAL, anchor="lm")

    # title
    title_font = font("georgia.ttf", 78)
    max_text = W - 84 - 380
    lines = wrap(d, a.title, title_font, max_text)
    if len(lines) > 2:
        title_font = font("georgia.ttf", 64)
        lines = wrap(d, a.title, title_font, max_text)
    y = 214
    for line in lines:
        d.text((80, y), line, font=title_font, fill=INK)
        y += int(title_font.size * 1.02)

    # summary
    y += 22
    sum_font = font("segoeui.ttf", 30)
    for line in wrap(d, a.summary, sum_font, max_text)[:2]:
        d.text((84, y), line, font=sum_font, fill=MUTED)
        y += 42

    # badge pill
    if a.badge:
        y += 26
        badge_font = font("seguisb.ttf", 26)
        tw = d.textlength(a.badge, font=badge_font)
        d.rounded_rectangle([84, y, 84 + tw + 56, y + 58], radius=29, fill=TEAL)
        d.text((84 + 28 + tw / 2, y + 29), a.badge, font=badge_font, fill=PAPER, anchor="mm")

    # url footer
    d.text((84, H - 84), f"deonmenezes.com/resources/{a.slug}",
           font=font("segoeui.ttf", 24), fill=MUTED, anchor="lm")

    draw_phone(img, W - 330, 130, scale=0.95)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
