# www.matweb.com'u taklit eden yerel HTTP vekil sunucusu: MatGUID -> yerel HTML dosyası
import http.server, sys, urllib.parse
import os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
PAGES = {'a'*32: R+'fixtures/conditional.htm', 'b'*32: R+'fixtures/overview.htm', 'c'*32: R+'private/aisi-6000.htm'}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = {k.lower(): v for k, v in urllib.parse.parse_qs(u.query).items()}
        f = PAGES.get(q.get('matguid', [''])[0])
        if not f or 'matweb.com' not in (u.netloc or self.headers.get('Host', '')):
            self.send_response(404); self.end_headers(); return
        body = open(f, 'rb').read()
        self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
PAGES = {k: v for k, v in PAGES.items() if os.path.exists(v)}
if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', 8765), H).serve_forever()
