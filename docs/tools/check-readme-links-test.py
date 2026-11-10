"""Regression cases for the documentation link check."""
import runpy
import unittest
from pathlib import Path

check = runpy.run_path(str(Path(__file__).with_name("check-readme-links.py")))["missing_links"]


class ReadmeLinksTest(unittest.TestCase):
    def test_markdown_and_html_paths(self):
        local, missing = check('[Readme](README.md#install) <img src="README.md"> <source srcset="LICENSE 1x, CHANGELOG.md 2x">')
        self.assertEqual(local, {"README.md", "LICENSE", "CHANGELOG.md"})
        self.assertEqual(missing, [])

    def test_external_fragment_and_missing(self):
        local, missing = check('[a](https://example.test/x) [b](#install) ![c](docs/not-a-real%20image.png)')
        self.assertEqual(local, {"docs/not-a-real image.png"})
        self.assertEqual(missing, ["docs/not-a-real image.png"])


if __name__ == "__main__":
    unittest.main()
