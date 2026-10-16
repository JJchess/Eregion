#!/usr/bin/env python3
"""Serve the exact Pages artifact on loopback, without APIs or SPA fallbacks."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import re
from typing import NamedTuple
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class RequestTarget(NamedTuple):
    status: int
    file: Path | None = None
    location: str | None = None


def normalize_base_path(value):
    if not isinstance(value, str) or not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]*", value):
        raise ValueError("base_path must be an absolute URL path without traversal, query or fragment")
    return value.rstrip("/") + "/"


def resolve_request(directory, request_path, base_path="/portfolio/"):
    """Map a request to a real static file; also used by socket-free tests."""
    base = normalize_base_path(base_path)
    root = Path(directory)
    if root.is_symlink() or not root.is_dir():
        return RequestTarget(404)
    root = root.resolve()
    try:
        parsed = urlsplit(request_path)
        route = unquote(parsed.path, errors="strict")
    except (ValueError, UnicodeDecodeError):
        return RequestTarget(400)
    if any(ord(c) < 32 for c in request_path + route) or "\\" in route or not route.startswith("/"):
        return RequestTarget(400)
    suffix = "?" + parsed.query if parsed.query else ""
    if route == "/" and base != "/":
        return RequestTarget(302, location=base + suffix)
    if route == base.rstrip("/") and base != "/":
        return RequestTarget(301, location=base + suffix)
    if not route.startswith(base):
        return RequestTarget(404)
    relative = route[len(base):]
    parts = relative.split("/")
    if any(part.startswith(".") or part in {"node_modules", "__pycache__"} for part in parts if part):
        return RequestTarget(404)
    path = root / relative
    if any(p.is_symlink() for p in [path, *path.parents] if p.is_relative_to(root)) or not path.resolve().is_relative_to(root):
        return RequestTarget(404)
    if path.is_dir():
        if not (path / "index.html").is_file() or (path / "index.html").is_symlink():
            return RequestTarget(404)
        if not route.endswith("/"):
            return RequestTarget(301, location=quote(route, safe="/") + "/" + suffix)
        path /= "index.html"
    if not path.is_file():
        return RequestTarget(404)
    return RequestTarget(200, path)


class PortfolioHandler(BaseHTTPRequestHandler):
    directory = ROOT / "_site"
    base_path = "/portfolio/"

    def do_HEAD(self):
        self.respond(False)

    def do_GET(self):
        self.respond(True)

    def respond(self, body):
        target = resolve_request(self.directory, self.path, self.base_path)
        if target.location:
            self.send_response(target.status)
            self.send_header("Location", target.location)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        status, file = target.status, target.file
        if status == 404:
            # Pages serves one root 404 artifact for every missing path. The
            # shared client can localize it without changing the HTTP status.
            fallback = resolve_request(self.directory, self.base_path + "404.html", self.base_path)
            file = fallback.file
        if file is None:
            self.send_error(status)
            return
        size = file.stat().st_size
        start, end = 0, size - 1
        requested = self.headers.get("Range") if status == 200 else None
        if requested:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
            if not match or not any(match.groups()):
                return self.range_error(size)
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), end) if last else end
            elif int(last) > 0:
                start = max(0, size - int(last))
            else:
                return self.range_error(size)
            if start > end or start >= size:
                return self.range_error(size)
            status = 206
        self.send_response(status)
        content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        if content_type in {"text/html", "text/css", "text/javascript", "application/javascript", "application/json"}:
            content_type += "; charset=utf-8"
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if body:
            try:
                with file.open("rb") as source:
                    source.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        chunk = source.read(min(262144, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def range_error(self, size):
        self.send_response(416)
        self.send_header("Content-Range", f"bytes */{size}")
        self.send_header("Content-Length", "0")
        self.end_headers()


def make_handler(directory, base_path="/portfolio/"):
    return type("StaticPortfolioHandler", (PortfolioHandler,), {
        "directory": Path(directory).absolute(), "base_path": normalize_base_path(base_path),
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4179)
    parser.add_argument("--directory", type=Path, default=ROOT / "_site")
    parser.add_argument("--base-path", default="/portfolio/")
    args = parser.parse_args()
    if not args.directory.is_dir() or args.directory.is_symlink():
        parser.error("--directory must point to a real built static directory")
    handler = make_handler(args.directory, args.base_path)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Portfolio preview: http://127.0.0.1:{args.port}{handler.base_path}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
