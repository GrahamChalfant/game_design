# Local web server for SQL: The Sequel. Unlike `python3 -m http.server`, it tells the browser
# not to cache files, so after you edit or pull you always get the latest version
# (instead of a mix of old and new files).
#
# Usage, from anywhere:  python3 sql-daily/serve.py        (then open http://localhost:8001)
#            or a port:  python3 sql-daily/serve.py 8002

import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
handler = functools.partial(NoCacheHandler, directory=os.path.dirname(os.path.abspath(__file__)))
print(f'SQL: The Sequel is playing at http://localhost:{port}  (press Ctrl+C to stop)')
try:
    http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
except KeyboardInterrupt:
    pass
