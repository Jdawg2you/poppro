#!/usr/bin/env python3
"""Local preview server for POP Pro: like `python3 -m http.server`, but tells the browser never to
reuse a cached copy, so a reload always shows the latest build. Usage: serve-nocache.py PORT DIR"""
import http.server, sys, functools
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass
port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=root)).serve_forever()
