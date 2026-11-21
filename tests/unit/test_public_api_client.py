"""Contract tests for the Python public API client.

The JS and Go clients mirror these shapes: unwrapped lists, acceptance
criteria on create_task, and the MCP protocol header. A local stub stands
in for the worker so CI does not call production.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from core.public_api_client import LazynextApiClient


class _Handler(BaseHTTPRequestHandler):
    seen: list = []

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        return json.loads(raw) if raw else None

    def _json(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _record(self, body):
        type(self).seen.append(
            {
                "method": self.command,
                "path": self.path,
                "auth": self.headers.get("Authorization"),
                "mcp": self.headers.get("MCP-Protocol-Version"),
                "body": body,
            }
        )

    def do_GET(self):
        self._record(None)
        if self.path == "/api/v1/health":
            self._json(200, {"ok": True, "service": "lazynext-api"})
        elif self.path.startswith("/api/v1/briefings/"):
            self._json(200, {"briefing": {"id": 7, "subject": "ops", "content": "hi"}})
        elif self.path.startswith("/api/v1/briefings"):
            self._json(200, {"briefings": [{"id": 7, "subject": "ops", "preview": "p"}]})
        elif self.path.startswith("/api/v1/tasks"):
            self._json(200, {"tasks": [{"status": "pending", "description": "ship"}]})
        elif self.path == "/api/v1/agents":
            self._json(200, {"agents": [{"agent_id": "cto", "tasks": 2}]})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        body = self._body()
        self._record(body)
        if self.path == "/api/v1/waitlist":
            self._json(200, {"ok": True, "seq_sent": False})
        elif self.path == "/api/v1/tasks":
            self._json(201, {"task_id": "t1", "message_id": "m1", "channel": body["channel"]})
        elif self.path == "/api/v1/knowledge/search":
            self._json(200, {"results": [{"filename": "a.md", "content": "hello"}]})
        elif self.path == "/mcp" and body["method"] == "tools/list":
            self._json(200, {"jsonrpc": "2.0", "id": 1, "result": {"tools": [{"name": "company_status", "description": "snapshot"}]}})
        elif self.path == "/mcp":
            self._json(200, {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": "ok"}]}})
        else:
            self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        return


@pytest.fixture()
def client():
    _Handler.seen = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    api = LazynextApiClient(api_key="lzk_test", base_url=f"http://{host}:{port}")
    yield api
    server.shutdown()


def test_public_client_matches_worker_envelopes(client):
    health = client.health()
    assert health["ok"] is True
    assert _Handler.seen[-1]["auth"] is None

    joined = client.join_waitlist("a@b.co")
    assert joined == {"ok": True, "seq_sent": False}
    assert _Handler.seen[-1]["auth"] is None
    assert _Handler.seen[-1]["body"] == {"email": "a@b.co"}

    briefings = client.list_briefings(limit=3)
    assert briefings[0]["subject"] == "ops"
    assert "limit=3" in _Handler.seen[-1]["path"]

    briefing = client.get_briefing(7)
    assert briefing["content"] == "hi"

    tasks = client.list_tasks(limit=5)
    assert tasks[0]["status"] == "pending"

    created = client.create_task("ship the fix", acceptance_criteria=["tests pass"])
    assert created["task_id"] == "t1"
    assert _Handler.seen[-1]["body"]["acceptance_criteria"] == ["tests pass"]
    assert _Handler.seen[-1]["auth"] == "Bearer lzk_test"

    rows = client.search_knowledge(query="hello", topK=2, vector=[0.1, 0.2])
    assert rows[0]["filename"] == "a.md"
    assert _Handler.seen[-1]["body"]["vector"] == [0.1, 0.2]

    agents = client.list_agents()
    assert agents[0]["agent_id"] == "cto"

    tools = client.mcp_tools()
    assert tools[0]["name"] == "company_status"
    assert _Handler.seen[-1]["mcp"] == "2026-07-28"

    result = client.mcp_tool_call("company_status", {})
    assert result["content"][0]["text"] == "ok"
    assert _Handler.seen[-1]["mcp"] == "2026-07-28"
