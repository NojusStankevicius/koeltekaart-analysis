#!/usr/bin/env python3
"""Assemble the published dashboard from its three source files plus dashboard.json.

The standalone wrapper mirrors the Artifact host's skeleton exactly, including
`[hidden]{display:none!important}` - without it, a `display:flex` rule silently beats the
`hidden` attribute locally and the local build stops matching what ships.

The page carries no data of its own: `data/processed/dashboard.json` is inlined at build
time, so the dashboard cannot drift from the notebook. Re-run section 19, then re-run this.

    python docs/dashboard/build.py            # -> docs/dashboard/index.html
    python docs/dashboard/build.py --standalone   # adds <html>/<body> for opening locally

`index.html` is what gets published as the Artifact. Published without the standalone
wrapper: the Artifact host supplies the document skeleton itself.
"""
import argparse
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
DATA = ROOT / "data" / "processed" / "dashboard.json"

SKELETON = (
    '<!doctype html><html><head><meta charset=utf8>'
    '<meta name=viewport content="width=device-width,initial-scale=1">'
    '<style>:root{color-scheme:light}body{margin:0;padding:0;'
    'font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
    'img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n'
)


def build(standalone=False):
    if not DATA.exists():
        raise SystemExit(f"{DATA} is missing - run notebook section 19 first")
    page = "\n".join([
        (HERE / "style.html").read_text(),
        (HERE / "markup.html").read_text(),
        "<script>\nconst D = " + DATA.read_text().strip() + ";",
        (HERE / "app.js").read_text(),
        "</script>",
    ])
    if standalone:
        page = SKELETON + page + "\n</body></html>"
    out = HERE / ("standalone.html" if standalone else "index.html")
    out.write_text(page)
    print(f"{out} - {len(page) / 1024:,.0f} KB, data {DATA.stat().st_size / 1024:,.0f} KB")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--standalone", action="store_true",
                   help="wrap in <html>/<body> so it opens as a local file")
    build(p.parse_args().standalone)
