# Serves the game for playing and testing locally, like `python -m http.server`, but tells the
# browser not to keep old copies of the files: after you pull or edit, a normal refresh shows
# the latest code and models. (The plain server lets the browser reuse stale JavaScript.)
#   python serve.py            -> http://localhost:8000
#   python serve.py 8080       -> another port
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    here = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCache, directory=here)
    with http.server.ThreadingHTTPServer(('', port), handler) as server:
        print(f'Serving the game at http://localhost:{port} (Ctrl+C to stop)')
        server.serve_forever()
