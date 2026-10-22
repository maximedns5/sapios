"""Extrait les contours du logotype « sapios » (Bodoni Moda italique 500) en chemins SVG.

Le résultat, `glyphs.json`, est commité : `generate-icons.mjs` dessine les icônes à partir de ces
contours, sans dépendre d'une police installée. À relancer seulement si la police change :

    pip install fonttools
    python3 apps/mobile/scripts/extract-glyphs.py
"""

import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[3]
FONT = ROOT / "node_modules/@expo-google-fonts/bodoni-moda/500Medium_Italic/BodoniModa_500Medium_Italic.ttf"
OUT = Path(__file__).with_name("glyphs.json")
WORD = "sapios"


def pair_kerning(font, left, right):
    """Ajustement de paire GPOS (formats 1 et 2) entre deux glyphes, en unités de la police."""
    if "GPOS" not in font:
        return 0
    total = 0
    for lookup in font["GPOS"].table.LookupList.Lookup:
        if lookup.LookupType not in (2, 9):
            continue
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                if sub.ExtensionLookupType != 2:
                    continue
                sub = sub.ExtSubTable
            coverage = sub.Coverage.glyphs
            if left not in coverage:
                continue
            if sub.Format == 1:
                pairs = sub.PairSet[coverage.index(left)].PairValueRecord
                for rec in pairs:
                    if rec.SecondGlyph == right and rec.Value1 is not None:
                        total += getattr(rec.Value1, "XAdvance", 0) or 0
            elif sub.Format == 2:
                c1 = sub.ClassDef1.classDefs.get(left, 0)
                c2 = sub.ClassDef2.classDefs.get(right, 0)
                rec = sub.Class1Record[c1].Class2Record[c2]
                if rec.Value1 is not None:
                    total += getattr(rec.Value1, "XAdvance", 0) or 0
    return total


def main():
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    names = [cmap[ord(c)] for c in WORD]

    glyphs = {}
    for char, name in zip(WORD, names):
        if char in glyphs:
            continue
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(pen)
        glyphs[char] = {"advance": font["hmtx"][name][0], "path": pen.getCommands()}

    # Position de chaque lettre du logotype, crénage compris (y vers le haut, unités de la police).
    x, layout = 0, []
    for i, (char, name) in enumerate(zip(WORD, names)):
        layout.append({"char": char, "x": x})
        x += font["hmtx"][name][0]
        if i + 1 < len(names):
            x += pair_kerning(font, name, names[i + 1])

    data = {
        "source": "BodoniModa_500Medium_Italic.ttf (@expo-google-fonts/bodoni-moda, SIL OFL 1.1)",
        "unitsPerEm": font["head"].unitsPerEm,
        "ascent": font["hhea"].ascent,
        "descent": font["hhea"].descent,
        "xHeight": font["OS/2"].sxHeight,
        "glyphs": glyphs,
        "word": {"text": WORD, "advance": x, "layout": layout},
    }
    OUT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"{OUT.name} : {len(glyphs)} glyphes, logotype de {x} unités")


if __name__ == "__main__":
    main()
