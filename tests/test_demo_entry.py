"""A work card opens its actual demo; archival details remain the fallback."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("entry_builder", ROOT / "scripts/build.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DemoEntryTests(unittest.TestCase):
    def setUp(self):
        self.work = {
            "slug": "example", "locale": "en", "title": "Example",
            "summary": "An actual demo", "kind": "page", "date": "2026-10-18",
            "tags": [], "highlights": [], "preview": "preview.webp",
            "translations": {"zh": {"title": "示例"}},
        }
        self.media = {"preview_url": "/Eregion/media/example/preview.webp",
                      "cover_url": "/Eregion/media/example/preview.webp", "demo_url": None}

    def card(self, locale):
        return builder.work_card(self.work, locale, "/Eregion/", {"kind_page": "Page"}, self.media)

    def test_local_demo_opens_full_page_with_language(self):
        self.work["demo"] = "demo/index.html"
        self.media["demo_url"] = "/Eregion/demos/example/"
        for language in ("en", "zh"):
            self.assertIn(f'href="/Eregion/demos/example/?lang={language}"', self.card(language))

    def test_external_demo_keeps_query_and_escapes_attribute(self):
        self.work["demo"] = "https://example.org/demo?a=1&b=2"
        self.media["demo_url"] = self.work["demo"]
        for language in ("en", "zh"):
            self.assertIn('href="https://example.org/demo?a=1&amp;b=2"', self.card(language))
            self.assertNotIn("?lang=", self.card(language))

    def test_no_demo_falls_back_to_localized_details(self):
        self.work["demo"] = None
        self.assertIn('href="/Eregion/projects/example/"', self.card("en"))
        self.assertIn('href="/Eregion/zh/projects/example/"', self.card("zh"))


if __name__ == "__main__":
    unittest.main()
