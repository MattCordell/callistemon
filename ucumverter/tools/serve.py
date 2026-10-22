"""Serve the repo root for local UCUMverter testing, with browser caching turned off.

The plain `python -m http.server` sends no cache headers, so browsers can keep stale
copies of ES modules after an edit. This server sends `Cache-Control: no-store`, so a
normal reload always picks up the latest files.

Usage (from anywhere):  python ucumverter/tools/serve.py [port]
"""

import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    print(f"Serving {ROOT} with caching off")
    print(f"Open http://localhost:{port}/ucumverter/  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    main()
