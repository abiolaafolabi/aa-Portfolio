"""Local preview + edit server for the portfolio.

Run from this folder:  python3 edit_server.py
Then open:             http://localhost:4321/portfolio.html?edit

Only listens on this Mac (127.0.0.1). The public GitHub site can't save anything.
"""
import json
import os
import re
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 4321

try:
    from PIL import Image, ImageOps
except ImportError:  # images are saved as-is without Pillow
    Image = None


def slug(text, fallback="file"):
    text = re.sub(r"[^a-z0-9.-]+", "-", text.lower()).strip("-.")
    return text or fallback


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_POST(self):
        url = urlparse(self.path)
        try:
            if url.path == "/api/save":
                content = json.loads(self.body())
                with open(os.path.join(ROOT, "content.js"), "w") as f:
                    f.write("/* Site content. Edited by hand or by edit mode (python3 edit_server.py, then add ?edit to the page URL). */\n")
                    f.write("window.CONTENT = " + json.dumps(content, indent=2, ensure_ascii=False) + ";\n")
                return self.reply(200, {"ok": True})

            if url.path == "/api/upload":
                q = parse_qs(url.query)
                folder = slug(q.get("project", ["misc"])[0], "misc")
                name, ext = os.path.splitext(q.get("name", ["image.jpg"])[0])
                ext = ext.lower() or ".jpg"
                if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".mp4", ".webm", ".mov"}:
                    return self.reply(400, {"error": f"{ext} files aren't supported"})
                os.makedirs(os.path.join(ROOT, "work", folder), exist_ok=True)
                base = slug(name, "image")
                rel = f"work/{folder}/{base}{ext}"
                n = 2
                while os.path.exists(os.path.join(ROOT, rel)):
                    rel = f"work/{folder}/{base}-{n}{ext}"
                    n += 1
                path = os.path.join(ROOT, rel)
                with open(path, "wb") as f:
                    f.write(self.body())
                # Keep photos web-sized
                if Image and ext in {".jpg", ".jpeg", ".png", ".webp"}:
                    try:
                        im = ImageOps.exif_transpose(Image.open(path))
                        if max(im.size) > 1800:
                            im.thumbnail((1800, 1800))
                            if ext in {".jpg", ".jpeg"}:
                                im.convert("RGB").save(path, quality=85, optimize=True)
                            else:
                                im.save(path, optimize=True)
                    except Exception:
                        pass  # keep the original file if it can't be resized
                return self.reply(200, {"path": rel})

            if url.path == "/api/publish":
                def git(*args):
                    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                                          env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
                git("add", "-A")
                commit = git("commit", "-m", "Update from edit mode")
                push = git("push", "origin", "HEAD")
                ok = push.returncode == 0
                return self.reply(200 if ok else 500, {"ok": ok, "log": (commit.stdout + push.stdout + push.stderr)[-2000:]})

            return self.reply(404, {"error": "unknown endpoint"})
        except Exception as e:  # report the problem to the page instead of crashing
            return self.reply(500, {"error": str(e)})


if __name__ == "__main__":
    print(f"Edit server running: http://localhost:{PORT}/portfolio.html?edit")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
