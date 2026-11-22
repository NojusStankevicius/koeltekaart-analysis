#!/usr/bin/env python3
"""Assemble the published dashboard from its three source files plus dashboard.json.

The standalone wrapper mirrors the Artifact host's skeleton exactly, including
`[hidden]{display:none!important}` - without it, a `display:flex` rule silently beats the
`hidden` attribute locally and the local build stops matching what ships.

The page carries no data of its own: `data/processed/dashboard.json` is inlined at build
time, so the dashboard cannot drift from the notebook. Re-run section 19, then re-run this.

    python docs/dashboard/build.py            # -> docs/dashboard/index.html
    python docs/dashboard/build.py --standalone   # adds <html>/<body> for opening locally
    python docs/dashboard/build.py --page ac [--standalone]   # the AC-grant page -> ac/

The AC-grant page reuses this stylesheet, adds `ac/style.html`, and also inlines
`data/processed/ac_grant.json` (notebook section 20) as `DA`.

`index.html` is what gets published as the Artifact. Published without the standalone
wrapper: the Artifact host supplies the document skeleton itself.
"""
import argparse
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
DATA = ROOT / "data" / "processed" / "dashboard.json"
AC_DATA = ROOT / "data" / "processed" / "ac_grant.json"

SKELETON = (
    '<!doctype html><html><head><meta charset=utf8>'
    '<meta name=viewport content="width=device-width,initial-scale=1">'
    '<style>:root{color-scheme:light}body{margin:0;padding:0;'
    'font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
    'img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n'
)


def build(standalone=False, page="main"):
    if not DATA.exists():
        raise SystemExit(f"{DATA} is missing - run notebook section 19 first")
    data = "<script>\nconst D = " + DATA.read_text().strip() + ";"
    if page == "ac":
        if not AC_DATA.exists():
            raise SystemExit(f"{AC_DATA} is missing - run notebook section 20 first")
        src = HERE / "ac"
        style = (HERE / "style.html").read_text().replace(
            "<title>Cooling Place Coverage</title>", "<title>AC Grant Siting</title>")
        parts = [style, (src / "style.html").read_text(), (src / "markup.html").read_text(),
                 data, "const DA = " + AC_DATA.read_text().strip() + ";",
                 (src / "app.js").read_text(), "</script>"]
    else:
        src = HERE
        parts = [(HERE / "style.html").read_text(), (HERE / "markup.html").read_text(),
                 data, (HERE / "app.js").read_text(), "</script>"]
    page_html = "\n".join(parts)
    if standalone:
        page_html = SKELETON + page_html + "\n</body></html>"
    out = src / ("standalone.html" if standalone else "index.html")
    out.write_text(page_html)
    print(f"{out} - {len(page_html) / 1024:,.0f} KB")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--standalone", action="store_true",
                   help="wrap in <html>/<body> so it opens as a local file")
    p.add_argument("--page", choices=["main", "ac"], default="main")
    a = p.parse_args()
    build(a.standalone, a.page)
