import http.client
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_HOST = os.environ["UPSTREAM_HOST"]
UPSTREAM_PORT = int(os.environ["UPSTREAM_PORT"])


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _forward(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else None
        headers = {key: value for key, value in self.headers.items()
                   if key.lower() not in {"connection", "transfer-encoding", "host"}}
        connection = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=10)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            data = response.read()
            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                if key.lower() not in {"connection", "transfer-encoding", "content-length", "server", "date"}:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Connection", "close")
            self.end_headers()
            if data:
                self.wfile.write(data)
        except OSError:
            data = b'{"error":"upstream unavailable"}'
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        finally:
            connection.close()

    do_GET = _forward
    do_POST = _forward
    do_PATCH = _forward
    do_PUT = _forward
    do_DELETE = _forward
    do_OPTIONS = _forward


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
