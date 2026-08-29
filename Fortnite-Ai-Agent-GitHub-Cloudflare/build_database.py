#!/usr/bin/env python3
from pathlib import Path
import gzip
import json
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
DB = ROOT / "database"
INDEX = DB / "index"
JSON_SRC = DB / "json-src"

INDEX.mkdir(parents=True, exist_ok=True)
JSON_SRC.mkdir(parents=True, exist_ok=True)

RAW = DB / "fortnite_assets.gz"
NEW = DB / "fortnite_assets_new.gz"

ASSET_REF_RE = re.compile(
    r"(?:/Game/|FortniteGame/|/[A-Za-z0-9_]+/)[A-Za-z0-9_./\-]+"
)

def read_gzip_lines(path: Path):
    if not path.exists():
        return []
    with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as f:
        return [line.strip() for line in f if line.strip()]

def write_gzip_lines(path: Path, lines):
    unique = list(dict.fromkeys(lines))
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
        for line in unique:
            f.write(line + "\n")
    return len(unique)

def basename(path: str):
    return path.rsplit("/", 1)[-1].lower()

def is_sm(path: str):
    return basename(path).startswith("sm_")

def is_material(path: str):
    name = basename(path)
    return name.startswith("m_") or name.startswith("mi_")

def is_mesh(path: str):
    name = basename(path)
    low = path.lower()
    return (
        name.startswith("sm_")
        or name.startswith("sk_")
        or "/meshes/" in low
        or "/mesh/" in low
        or "/staticmeshes/" in low
        or "/skeletalmeshes/" in low
    )

def extract_json_references():
    refs = []
    for file in JSON_SRC.rglob("*.json"):
        try:
            text = file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for match in ASSET_REF_RE.findall(text):
            cleaned = match.strip("'\"),]}")
            if any(prefix in cleaned for prefix in ("SM_", "SK_", "M_", "MI_")):
                refs.append(cleaned)

    return refs

def main():
    if not RAW.exists():
        raise SystemExit(
            "Missing database/fortnite_assets.gz\n"
            "Put the Th3Dry Fortnite database there first."
        )

    all_assets = read_gzip_lines(RAW)
    new_assets = read_gzip_lines(NEW)

    counts = {}
    counts["all"] = write_gzip_lines(INDEX / "all.txt.gz", all_assets)
    counts["sm"] = write_gzip_lines(INDEX / "sm.txt.gz", [x for x in all_assets if is_sm(x)])
    counts["m"] = write_gzip_lines(INDEX / "m.txt.gz", [x for x in all_assets if is_material(x)])
    counts["meshes"] = write_gzip_lines(INDEX / "meshes.txt.gz", [x for x in all_assets if is_mesh(x)])

    if new_assets:
        counts["new"] = write_gzip_lines(INDEX / "new.txt.gz", new_assets)

    json_refs = extract_json_references()
    counts["jsonReferences"] = write_gzip_lines(INDEX / "json-references.txt.gz", json_refs)

    manifest = {
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "source": {
            "fortnite_assets": RAW.name,
            "fortnite_assets_new": NEW.name if NEW.exists() else None
        }
    }

    (DB / "manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8"
    )

    print(json.dumps(manifest, indent=2))

if __name__ == "__main__":
    main()
