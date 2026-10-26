"""Fetch pinned public inputs and extract data only; never loads a mod or executes JS."""
import hashlib
import pathlib
import urllib.request
import zipfile

BASE = pathlib.Path(__file__).resolve().parents[1] / "data" / "upstream"
SOURCES = [
    ("ATM10-8.3.zip", "https://mediafilez.forgecdn.net/files/9190/157/All%20the%20Mods%2010-8.3.zip", "24440fb355de69b28af6ff18556b5d0598bb93570b2b745552cdb1bcb5448c8f", "release"),
    ("allthecompressed-1.21.1-4.4.0.jar", "https://mediafilez.forgecdn.net/files/7361/502/allthecompressed-1.21.1-4.4.0.jar", "d1b0c1135d8c206b8f18c73afa08256c74f8b9504626f90e2a64614c92163c36", "compressed"),
]
BASE.mkdir(parents=True, exist_ok=True)
for filename, url, expected, folder in SOURCES:
    target = BASE / filename
    if not target.exists():
        print(f"Downloading {filename}")
        urllib.request.urlretrieve(url, target)
    with target.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected:
        raise SystemExit(f"Hash mismatch for {filename}; input is retained for inspection")
    with zipfile.ZipFile(target) as archive:
        for entry in archive.infolist():
            path = pathlib.PurePosixPath(entry.filename)
            if path.is_absolute() or ".." in path.parts:
                raise SystemExit("Unsafe archive entry")
            wanted = (folder == "release" and (entry.filename == "manifest.json" or entry.filename.startswith(("overrides/kubejs/", "overrides/config/ftbquests/"))) and path.suffix in (".js", ".json", ".snbt")) or (folder == "compressed" and "/recipe/" in entry.filename and path.suffix == ".json")
            if wanted:
                output = BASE / folder / pathlib.Path(*path.parts)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(archive.read(entry))
    print(f"Verified and extracted {filename}: {actual}")
