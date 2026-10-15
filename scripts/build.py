#!/usr/bin/env python3
"""Build the public gallery from approved works using only the Python stdlib."""
import argparse
from datetime import date
from html import escape
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parents[1]
REPO = "https://github.com/JJchess/portfolio"
KINDS = {"component": "组件", "page": "页面", "experiment": "交互实验"}


def local_file(folder, value):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError(f"Invalid relative file in {folder.name}")
    path = folder / value
    if ".." in Path(value).parts or any(p.is_symlink() for p in [path, *path.parents] if p != folder.parent):
        raise ValueError(f"Unsafe file path in {folder.name}: {value}")
    if not path.resolve().is_relative_to(folder.resolve()) or not path.is_file():
        raise ValueError(f"Missing or unsafe file in {folder.name}: {value}")
    return path


def load_works(root):
    result = []
    for folder in sorted((root / "works").iterdir()):
        if not folder.is_dir():
            continue
        if folder.is_symlink() or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", folder.name):
            raise ValueError(f"Invalid work directory: {folder.name}")
        info = json.loads(local_file(folder, "work.json").read_text())
        for field in ["title", "summary", "date", "preview"]:
            if not isinstance(info.get(field), str) or not info[field].strip():
                raise ValueError(f"{folder.name}: missing {field}")
        date.fromisoformat(info["date"])
        if info.get("kind") not in KINDS:
            raise ValueError(f"{folder.name}: invalid kind")
        for field in ["tags", "highlights"]:
            if not isinstance(info.get(field), list) or not all(isinstance(x, str) and x.strip() for x in info[field]):
                raise ValueError(f"{folder.name}: {field} must be a list of strings")
        local_file(folder, "README.md")
        src = folder / "src"
        if not src.is_dir() or src.is_symlink() or not any(p.is_file() and not p.is_symlink() for p in src.rglob("*")):
            raise ValueError(f"{folder.name}: source files required")
        preview = local_file(folder, info["preview"])
        if preview.suffix.lower() not in {".webp", ".png", ".jpg", ".jpeg"}:
            raise ValueError(f"{folder.name}: unsupported preview format")
        demo = info.get("demo")
        if demo is not None:
            if not isinstance(demo, str):
                raise ValueError(f"{folder.name}: invalid demo")
            if demo.startswith("https://"):
                url = urlparse(demo)
                if not url.hostname or url.username or url.password:
                    raise ValueError(f"{folder.name}: invalid HTTPS demo")
            elif demo == "demo/index.html":
                local_file(folder, demo)
                for p in (folder / "demo").rglob("*"):
                    if p.is_symlink() or p.name.startswith(".") or p.name in {"node_modules", "__pycache__"}:
                        raise ValueError(f"{folder.name}: unsafe demo asset {p.name}")
            else:
                raise ValueError(f"{folder.name}: demo must be HTTPS, demo/index.html or null")
        result.append({**info, "slug": folder.name, "folder": folder})
    return sorted(result, key=lambda w: (w["date"], w["slug"]), reverse=True)


def card(work, output):
    slug = work["slug"]
    dest = output / "media" / slug
    dest.mkdir(parents=True)
    preview = local_file(work["folder"], work["preview"])
    shutil.copy2(preview, dest / preview.name)
    thumbnail = f"media/{slug}/{quote(preview.name)}"
    source = f"{REPO}/tree/main/works/{slug}"
    demo = work.get("demo")
    if demo == "demo/index.html":
        shutil.copytree(work["folder"] / "demo", output / "demos" / slug)
        demo = f"demos/{slug}/"
    links = f'<a href="{source}">源码与说明 <span aria-hidden="true">↗</span></a>'
    if demo:
        links = f'<a href="{escape(demo, quote=True)}">体验作品 <span aria-hidden="true">↗</span></a>' + links
    tags = " · ".join(escape(x) for x in work["tags"])
    highlights = "".join(f"<li>{escape(x)}</li>" for x in work["highlights"])
    return f'''<article class="work" data-kind="{work['kind']}">
      <a class="work-image" href="{escape(demo or source, quote=True)}"><img src="{thumbnail}" alt="{escape(work['title'], quote=True)}，作品预览" loading="lazy" width="1200" height="800"></a>
      <div class="work-meta"><span>{KINDS[work['kind']]}</span><time datetime="{work['date']}">{work['date']}</time></div>
      <h3>{escape(work['title'])}</h3><p>{escape(work['summary'])}</p>
      <ul class="highlights">{highlights}</ul><p class="tags">{tags}</p><div class="work-links">{links}</div>
    </article>'''


def build(root=ROOT):
    root = Path(root).resolve()
    works = load_works(root)  # Validate before replacing the last successful output.
    with tempfile.TemporaryDirectory(prefix="portfolio-build-", dir=root) as temp:
        output = Path(temp)
        shutil.copy2(root / "site" / "style.css", output / "style.css")
        shutil.copy2(root / "site" / "filter.js", output / "filter.js")
        cards = "\n".join(card(work, output) for work in works)
        if not cards:
            cards = '''<div class="empty"><span class="empty-symbol" aria-hidden="true">[ &nbsp; ]</span>
            <div><h3>第一件作品，正在路上。</h3><p>这里会留下值得反复体验的界面与交互。</p></div></div>'''
        filters = ""
        if works:
            filters = '<div class="filters" role="group" aria-label="按作品类型筛选">' + "".join(
                f'<button type="button" data-filter="{key}" aria-pressed="{"true" if key == "all" else "false"}">{label}</button>'
                for key, label in {"all": "全部", **KINDS}.items()) + '</div>'
        template = (root / "site" / "index.html").read_text()
        html = template.replace("<!-- WORKS -->", cards).replace("<!-- FILTERS -->", filters)
        (output / "index.html").write_text(html)
        (output / ".nojekyll").touch()
        target = root / "_site"
        if target.is_symlink():
            raise ValueError("Refusing to replace a symlinked _site")
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(output, target)
    return len(works)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.parse_args()
    print(f"Built {build()} works into {ROOT / '_site'}")
