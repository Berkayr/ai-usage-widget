"""Check that README Markdown and HTML links resolve inside the checkout."""
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"src", "href"} and value:
                self.paths.append(value)
            elif key == "srcset" and value:
                self.paths.extend(item.strip().split()[0] for item in value.split(","))


def missing_links(markdown):
    parser = Links()
    parser.feed(markdown)
    paths = parser.paths + re.findall(r"!?\[[^\]]*\]\(([^\s)]+)(?:\s+\"[^\"]*\")?\)", markdown)
    local = set()
    for value in paths:
        url = urlsplit(value.strip("<>"))
        if not url.scheme and not url.netloc and url.path:
            local.add(unquote(url.path))
    return local, sorted(path for path in local if not (ROOT / path).exists())


if __name__ == "__main__":
    local, missing = missing_links((ROOT / "README.md").read_text())
    if missing:
        raise SystemExit("Missing README paths:\n" + "\n".join(missing))
    print(f"PASS: {len(local)} unique local README paths exist (Markdown + HTML).")
