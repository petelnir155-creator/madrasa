"""Extract raw rows from data/madrasa.xlsx into data/raw.json.

Run once whenever the workbook changes:  python3 scripts/extract_xlsx.py
Then:                                    npm run seed

Kept separate from the TypeScript pipeline so Node deploys do not need an xlsx parser.
"""
import json, sys, openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else "data/madrasa.xlsx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/raw.json"

def s(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()

wb = openpyxl.load_workbook(SRC, data_only=True)
raw = {"lessons": [], "categoryTabs": [], "extras": []}

# lesson tabs: sentence | translit (word as in the sentence) | meaning
for name, lesson in (("שיעור 2 כל המילים", 2), ("שיעור 3 כל המילים", 3)):
    for r in wb[name].iter_rows(min_row=2, values_only=True):
        sentence, translit, meaning = s(r[0]), s(r[1]), s(r[2])
        if translit and meaning:
            raw["lessons"].append(
                {"lesson": lesson, "sentence": sentence, "translit": translit, "hebrew": meaning}
            )

# category tabs: arabic | translit | meaning | category (category only on the first row of a group -> forward fill)
for name, default_cat in (
    ("שמות עצם ותארים", None),
    ("מילות קישור, דקדוק ושיחות", None),
    ("פעלים", "פעלים"),
    ("מקומות ושמות", None),
):
    cat = default_cat
    for r in wb[name].iter_rows(min_row=2, values_only=True):
        arabic, translit, meaning = s(r[0]), s(r[1]), s(r[2])
        if len(r) > 3 and s(r[3]):
            cat = s(r[3]).rstrip(":").strip()
        if translit and meaning:
            raw["categoryTabs"].append(
                {"tab": name, "arabic": arabic, "translit": translit, "hebrew": meaning, "category": cat}
            )

# names tab has shifted headers: arabic | translit | how it is spelled in Hebrew | category | notes
cat = "שמות פרטיים"
for r in wb["שמות ומקומות"].iter_rows(min_row=2, values_only=True):
    arabic, translit, hebrew = s(r[0]), s(r[1]), s(r[2])
    if len(r) > 3 and s(r[3]):
        cat = s(r[3]).rstrip(":").strip()
    if translit and hebrew:
        raw["extras"].append(
            {"tab": "שמות ומקומות", "arabic": arabic, "translit": translit, "hebrew": hebrew, "category": cat}
        )

json.dump(raw, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in raw.items()})
