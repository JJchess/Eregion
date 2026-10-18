#!/usr/bin/env python3
"""Build the bilingual static portfolio from approved works, using the stdlib."""
import argparse
from datetime import date
from html import escape
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import quote, urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ("en", "zh")
KINDS = ("component", "page", "experiment")
TRANSLATED_FIELDS = ("title", "summary", "tags", "highlights")
SITE_FILES = [
    "app.js", "style.css", "playground.js", "playground.css",
    "route-transitions.js", "route-transitions.css", "fluid-cursor.js", "fluid-cursor.css",
    "assets/mark.svg", "assets/brand.svg", "assets/manrope-latin.woff2", "assets/Manrope-OFL.txt",
    "vendor/three/three.module.js", "vendor/three/three.core.js", "vendor/three/LICENSE",
]
TOKEN = re.compile(r"\{\{([^{}]*)\}\}")


def local_file(folder, value):
    """Resolve a declared public file without following a symlink or traversal."""
    if (not isinstance(value, str) or not value or "\\" in value or "\0" in value
            or Path(value).is_absolute() or any(p in {".", ".."} for p in value.split("/"))):
        raise ValueError(f"Invalid relative file in {folder.name}: {value!r}")
    folder = Path(folder)
    path = folder / value
    if folder.is_symlink() or any(p.is_symlink() for p in [path, *path.parents] if p != folder.parent):
        raise ValueError(f"Unsafe file path in {folder.name}: {value}")
    if not path.resolve().is_relative_to(folder.resolve()) or not path.is_file():
        raise ValueError(f"Missing or unsafe file in {folder.name}: {value}")
    return path


def validate_text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name}: expected a nonempty string")


def validate_list(value, name):
    if not isinstance(value, list) or not all(isinstance(x, str) and x.strip() for x in value):
        raise ValueError(f"{name}: expected a list of nonempty strings")


def https_url(value, name):
    validate_text(value, name)
    try:
        url = urlparse(value)
        valid = url.scheme == "https" and url.hostname and not url.username and not url.password
    except ValueError:
        valid = False
    if not valid or any(ord(c) < 32 for c in value) or "\\" in value:
        raise ValueError(f"{name}: expected an HTTPS URL without credentials")
    return value


def normalize_base_path(value):
    if not isinstance(value, str) or not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]*", value):
        raise ValueError("base_path must be an absolute URL path without traversal, query or fragment")
    return value.rstrip("/") + "/"


def load_works(root):
    result = []
    archive = Path(root) / "works"
    if archive.is_symlink() or not archive.is_dir():
        raise ValueError("works must be a real directory")
    for folder in sorted(archive.iterdir()):
        if folder.is_symlink():
            raise ValueError(f"Invalid work directory: {folder.name}")
        if not folder.is_dir():
            continue
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", folder.name):
            raise ValueError(f"Invalid work directory: {folder.name}")
        info = json.loads(local_file(folder, "work.json").read_text(encoding="utf-8"))
        if not isinstance(info, dict):
            raise ValueError(f"{folder.name}: work.json must be an object")
        for field in ("title", "summary", "date", "preview"):
            validate_text(info.get(field), f"{folder.name}.{field}")
        date.fromisoformat(info["date"])
        if info.get("kind") not in KINDS:
            raise ValueError(f"{folder.name}: invalid kind")
        for field in ("tags", "highlights"):
            validate_list(info.get(field), f"{folder.name}.{field}")
        locale = info.get("locale", "zh")
        if locale not in LOCALES:
            raise ValueError(f"{folder.name}: locale must be en or zh")
        translations = info.get("translations", {})
        if not isinstance(translations, dict) or any(key not in LOCALES for key in translations):
            raise ValueError(f"{folder.name}: translations must contain only en/zh objects")
        for language, translated in translations.items():
            if not isinstance(translated, dict) or any(key not in TRANSLATED_FIELDS for key in translated):
                raise ValueError(f"{folder.name}: invalid {language} translation fields")
            for field, value in translated.items():
                validator = validate_list if field in ("tags", "highlights") else validate_text
                validator(value, f"{folder.name}.translations.{language}.{field}")
        local_file(folder, "README.md")
        src = folder / "src"
        if not src.is_dir() or src.is_symlink() or not any(p.is_file() and not p.is_symlink() for p in src.rglob("*")):
            raise ValueError(f"{folder.name}: source files required")
        preview = local_file(folder, info["preview"])
        if preview.suffix.lower() not in {".webp", ".png", ".jpg", ".jpeg"}:
            raise ValueError(f"{folder.name}: unsupported preview format")
        demo = info.get("demo")
        if demo is not None:
            if demo == "demo/index.html":
                local_file(folder, demo)
                for path in (folder / "demo").rglob("*"):
                    if path.is_symlink() or path.name.startswith(".") or path.name in {"node_modules", "__pycache__"}:
                        raise ValueError(f"{folder.name}: unsafe demo asset {path.name}")
            else:
                https_url(demo, f"{folder.name}.demo")
        result.append({**info, "locale": locale, "translations": translations,
                       "slug": folder.name, "folder": folder})
    return sorted(result, key=lambda work: (work["date"], work["slug"]), reverse=True)


def localize_work(work, locale):
    translated = work["translations"].get(locale, {})
    return {**work, **translated, "content_languages": {
        field: locale if field in translated else work["locale"] for field in TRANSLATED_FIELDS
    }}


def render(template, context):
    def replace(match):
        key = match.group(1).strip()
        if not re.fullmatch(r"[a-z][a-z0-9_]*", key) or key not in context:
            raise ValueError(f"Undefined template token: {key}")
        return str(context[key])
    return TOKEN.sub(replace, template)


def language_tag(locale):
    return "zh-CN" if locale == "zh" else "en"


def route_url(base, locale, route=""):
    return base + ("zh/" if locale == "zh" else "") + route


def copy_work_assets(work, output, base):
    slug = work["slug"]
    dest = output / "media" / slug
    dest.mkdir(parents=True)
    preview = local_file(work["folder"], work["preview"])
    shutil.copy2(preview, dest / preview.name)
    demo = work.get("demo")
    if demo == "demo/index.html":
        shutil.copytree(work["folder"] / "demo", output / "demos" / slug)
        demo = base + f"demos/{slug}/"
    return {"preview_url": base + f"media/{slug}/{quote(preview.name)}", "demo_url": demo}


def work_card(work, locale, base, copy, media):
    item = localize_work(work, locale)
    langs = item["content_languages"]
    title = escape(item["title"])
    tags = " · ".join(escape(tag) for tag in item["tags"])
    destination = media["demo_url"] or route_url(base, locale, 'projects/' + item['slug'] + '/')
    if work.get("demo") == "demo/index.html":
        destination += f"?lang={locale}"
    return f'''<article class="work" data-kind="{item['kind']}">
      <a class="project-card" href="{escape(destination, quote=True)}" aria-label="{escape(item['title'], quote=True)}">
        <div class="project-cover"><img src="{escape(media['preview_url'], quote=True)}" alt="{escape(item['title'], quote=True)}" loading="lazy" width="1200" height="800"><span class="project-arrow" aria-hidden="true">↗</span></div>
        <div class="project-meta"><span>{escape(copy['kind_' + item['kind']])}</span><time datetime="{item['date']}">{item['date']}</time></div>
        <h3 lang="{language_tag(langs['title'])}">{title}</h3>
        <p class="work-summary" lang="{language_tag(langs['summary'])}">{escape(item['summary'])}</p>
        <p class="tags" lang="{language_tag(langs['tags'])}">{tags}</p>
      </a></article>'''


def filters_html(works, locale, copy):
    if not works:
        return ""
    labels = {"all": copy.get("filter_all", "全部" if locale == "zh" else "All")}
    labels.update({kind: copy["kind_" + kind] for kind in KINDS})
    label = copy.get("filter_label", "按作品类型筛选" if locale == "zh" else "Filter by project type")
    buttons = "".join(
        f'<button type="button" data-filter="{key}" aria-pressed="{"true" if key == "all" else "false"}">{escape(value)}</button>'
        for key, value in labels.items())
    return f'<div class="filters" role="group" aria-label="{escape(label, quote=True)}">{buttons}</div>'


def build(root=ROOT, base_path="/portfolio/"):
    root = Path(root).resolve()
    base = normalize_base_path(base_path)
    works = load_works(root)
    site = root / "site"
    profile = json.loads(local_file(site, "profile.json").read_text(encoding="utf-8"))
    copy = json.loads(local_file(site, "copy.json").read_text(encoding="utf-8"))
    if not isinstance(profile, dict):
        raise ValueError("profile.json must be an object")
    validate_text(profile.get("name"), "profile.name")
    for field in ("github", "repository", "site_url"):
        https_url(profile.get(field), "profile." + field)
    # Canonicals always point to the published site; preview URLs keep their
    # requested base_path. Neither deployment path nor repository needs an API.
    public_base = profile["site_url"].rstrip("/") + "/"
    for locale in LOCALES:
        if not isinstance(copy, dict) or not isinstance(copy.get(locale), dict) or not all(isinstance(value, str) for value in copy[locale].values()):
            raise ValueError(f"copy.json must contain a flat {locale} string dictionary")
        for key in ("page_home_title", "page_about_title", "page_projects_title", "page_not_found_title", "meta_description", "source_label", "demo_label", *("kind_" + kind for kind in KINDS)):
            validate_text(copy[locale].get(key), f"copy.{locale}.{key}")
    templates = {name: local_file(site, f"templates/{name}.html").read_text(encoding="utf-8")
                 for name in ("shell", "home", "about", "projects", "detail", "404", "playground", "empty")}
    target = root / "_site"
    if target.is_symlink():
        raise ValueError("Refusing to replace a symlinked _site")
    with tempfile.TemporaryDirectory(prefix="portfolio-build-", dir=root) as temp:
        stage = Path(temp)
        output = stage / "output"
        output.mkdir()
        for asset in SITE_FILES:
            source = local_file(site, asset)
            destination = output / asset
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        media = {work["slug"]: copy_work_assets(work, output, base) for work in works}
        for locale in LOCALES:
            words = copy[locale]
            cards = [work_card(work, locale, base, words, media[work["slug"]]) for work in works]
            pages = [("home", "", None), ("about", "about/", None),
                     ("projects", "projects/", None), ("not-found", "404.html", None)]
            pages.extend(("detail", f"projects/{work['slug']}/", work) for work in works)
            for page, route, work in pages:
                localized = localize_work(work, locale) if work else None
                raw_title = localized["title"] if localized else words["page_" + page.replace("-", "_") + "_title"]
                other = "zh" if locale == "en" else "en"
                context = {key: escape(value) for key, value in words.items()}
                context.update({
                    "locale": locale, "lang": language_tag(locale), "base": escape(base),
                    "home_url": route_url(base, locale), "about_url": route_url(base, locale, "about/"),
                    "projects_url": route_url(base, locale, "projects/"),
                    "locale_url": route_url(base, other, route), "locale_label": "中文" if other == "zh" else "EN",
                    "canonical": escape(urljoin(public_base, ("zh/" if locale == "zh" else "") + route), quote=True),
                    "alternate_en": escape(urljoin(public_base, route), quote=True),
                    "alternate_zh": escape(urljoin(public_base, "zh/" + route), quote=True),
                    "page": page, "title": escape(raw_title + " — " + profile["name"]),
                    "description": escape(words["meta_description"], quote=True), "count": f"{len(works):02d}",
                    "cards": "\n".join(cards[:6] if page == "home" else cards),
                    "filters": filters_html(works, locale, words), "body": "", "playground": "",
                    "active_home": ' aria-current="page"' if page == "home" else "",
                    "active_about": ' aria-current="page"' if page == "about" else "",
                    "active_projects": ' aria-current="page"' if page in {"projects", "detail"} else "",
                    "profile_name": escape(profile["name"]), "profile_github": escape(profile["github"], quote=True),
                    "profile_repository": escape(profile["repository"], quote=True),
                    "github_url": escape(profile["github"], quote=True), "repository_url": escape(profile["repository"], quote=True),
                })
                if not cards:
                    context["cards"] = render(templates["empty"], context)
                if localized:
                    item = localized
                    langs = item["content_languages"]
                    demo = media[work["slug"]]["demo_url"]
                    demo_link = (f'<a class="pill" href="{escape(demo, quote=True)}">{escape(words["demo_label"])} <span aria-hidden="true">↗</span></a>' if demo else "")
                    next_link = ""
                    if len(works) > 1:
                        following = localize_work(works[(works.index(work) + 1) % len(works)], locale)
                        label = words.get("next_project_label", "下一个作品" if locale == "zh" else "Next project")
                        next_link = f'<a class="next-project" href="{route_url(base, locale, "projects/" + following["slug"] + "/")}"><span>{escape(label)}</span><strong lang="{language_tag(following["content_languages"]["title"])}">{escape(following["title"])}</strong><span aria-hidden="true">↗</span></a>'
                    fallback = any(langs[field] != locale and bool(item[field]) for field in TRANSLATED_FIELDS)
                    notice = ""
                    if fallback:
                        default = "部分作品内容保留英文原文。" if locale == "zh" else "Some project content is shown in its original Chinese."
                        message = words.get("original_language_" + work["locale"], default)
                        notice = f'<p class="original-language">{escape(message)}</p>'
                    context.update({
                        "work_title": escape(item["title"]), "work_summary": escape(item["summary"]),
                        "work_date": item["date"], "work_kind": escape(words["kind_" + item["kind"]]),
                        "work_tags": " · ".join(escape(tag) for tag in item["tags"]),
                        "work_highlights": "".join(f'<li lang="{language_tag(langs["highlights"])}">{escape(value)}</li>' for value in item["highlights"]),
                        "preview_url": escape(media[work["slug"]]["preview_url"], quote=True),
                        "source_url": escape(profile["repository"].rstrip("/") + "/tree/main/works/" + work["slug"], quote=True),
                        "demo_link": demo_link, "next_link": next_link, "original_language_notice": notice,
                        **{"work_" + field + "_lang": language_tag(langs[field]) for field in TRANSLATED_FIELDS},
                    })
                if page == "home":
                    context["playground"] = render(templates["playground"], context)
                context["body"] = render(templates["404" if page == "not-found" else page], context)
                rendered = render(templates["shell"], context)
                relative = ("zh/" if locale == "zh" else "") + route
                destination = output / (relative if route.endswith(".html") else relative + "index.html")
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(rendered, encoding="utf-8")
        (output / ".nojekyll").touch()
        # Validate/render completely before replacing the previous build. Keep
        # the previous directory available for rollback if the rename fails.
        backup = stage / "previous"
        if target.exists():
            target.rename(backup)
        try:
            output.rename(target)
        except OSError:
            if backup.exists():
                backup.rename(target)
            raise
    return len(works)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-path", default="/portfolio/")
    args = parser.parse_args()
    print(f"Built {build(base_path=args.base_path)} works into {ROOT / '_site'}")
