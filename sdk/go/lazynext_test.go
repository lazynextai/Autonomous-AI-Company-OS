package lazynext

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type captured struct {
	method  string
	path    string
	auth    string
	mcpVer  string
	body    map[string]any
	rawBody string
}

func stub(t *testing.T, reply func(cap captured, w http.ResponseWriter)) (*Client, *captured) {
	t.Helper()
	last := &captured{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		last.method = r.Method
		last.path = r.URL.RequestURI()
		last.auth = r.Header.Get("Authorization")
		last.mcpVer = r.Header.Get("MCP-Protocol-Version")
		last.rawBody = string(raw)
		last.body = nil
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &last.body)
		}
		reply(*last, w)
	}))
	t.Cleanup(srv.Close)
	c := New("lzk_test")
	c.BaseURL = srv.URL
	c.HTTP = srv.Client()
	return c, last
}

func writeJSON(w http.ResponseWriter, code int, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = io.WriteString(w, body)
}

func TestJoinWaitlistDecodesSuccessBody(t *testing.T) {
	c, last := stub(t, func(_ captured, w http.ResponseWriter) {
		writeJSON(w, 200, `{"ok":true,"seq_sent":false}`)
	})
	c.APIKey = ""
	out, err := c.JoinWaitlist("a@b.co")
	if err != nil {
		t.Fatalf("success body must decode, got %v", err)
	}
	if out["ok"] != true || out["seq_sent"] != false {
		t.Fatalf("body = %#v", out)
	}
	if last.path != "/api/v1/waitlist" || last.method != "POST" {
		t.Fatalf("request %s %s", last.method, last.path)
	}
	if last.auth != "" {
		t.Fatalf("public waitlist must not send a bearer, got %q", last.auth)
	}
	if last.body["email"] != "a@b.co" {
		t.Fatalf("email = %#v", last.body["email"])
	}
}

func TestJoinWaitlistErrorStatus(t *testing.T) {
	c, _ := stub(t, func(_ captured, w http.ResponseWriter) {
		writeJSON(w, 400, `{"error":"valid email required"}`)
	})
	_, err := c.JoinWaitlist("nope")
	if err == nil || !strings.Contains(err.Error(), "lazynext 400") {
		t.Fatalf("err = %v", err)
	}
}

func TestListMethodsUnwrapEnvelopes(t *testing.T) {
	c, last := stub(t, func(got captured, w http.ResponseWriter) {
		switch {
		case strings.HasPrefix(got.path, "/api/v1/briefings/"):
			writeJSON(w, 200, `{"briefing":{"id":7,"subject":"ops","content":"hi"}}`)
		case strings.HasPrefix(got.path, "/api/v1/briefings"):
			writeJSON(w, 200, `{"briefings":[{"id":7,"subject":"ops"}]}`)
		case strings.HasPrefix(got.path, "/api/v1/tasks"):
			writeJSON(w, 200, `{"tasks":[{"status":"pending","description":"ship"}]}`)
		case got.path == "/api/v1/agents":
			writeJSON(w, 200, `{"agents":[{"agent_id":"cto","tasks":2}]}`)
		case got.path == "/api/v1/health":
			writeJSON(w, 200, `{"ok":true,"service":"lazynext-api"}`)
		default:
			writeJSON(w, 404, `{"error":"not found"}`)
		}
	})
	health, err := c.Health()
	if err != nil || health["ok"] != true {
		t.Fatalf("health %#v %v", health, err)
	}
	briefings, err := c.ListBriefings(3)
	if err != nil || len(briefings) != 1 {
		t.Fatalf("briefings %#v %v", briefings, err)
	}
	if !strings.Contains(last.path, "limit=3") {
		t.Fatalf("limit query = %s", last.path)
	}
	row := briefings[0].(map[string]any)
	if row["subject"] != "ops" {
		t.Fatalf("row = %#v", row)
	}
	one, err := c.GetBriefing(7)
	if err != nil || one["content"] != "hi" {
		t.Fatalf("briefing %#v %v", one, err)
	}
	if last.path != "/api/v1/briefings/7" {
		t.Fatalf("path %s", last.path)
	}
	tasks, err := c.ListTasks(5)
	if err != nil || tasks[0].(map[string]any)["status"] != "pending" {
		t.Fatalf("tasks %#v %v", tasks, err)
	}
	agents, err := c.ListAgents()
	if err != nil || agents[0].(map[string]any)["agent_id"] != "cto" {
		t.Fatalf("agents %#v %v", agents, err)
	}
}

func TestCreateTaskSendsAcceptanceCriteria(t *testing.T) {
	c, last := stub(t, func(_ captured, w http.ResponseWriter) {
		writeJSON(w, 201, `{"task_id":"t1","message_id":"m1","channel":"cto.tasks"}`)
	})
	out, err := c.CreateTask("ship the fix", "cto.tasks", 1, []string{"tests pass"})
	if err != nil || out["task_id"] != "t1" {
		t.Fatalf("out %#v %v", out, err)
	}
	if last.auth != "Bearer lzk_test" {
		t.Fatalf("auth %q", last.auth)
	}
	got, _ := last.body["acceptance_criteria"].([]any)
	if len(got) != 1 || got[0] != "tests pass" {
		t.Fatalf("criteria %#v", last.body["acceptance_criteria"])
	}
	if last.body["priority"] != float64(1) {
		t.Fatalf("priority %#v", last.body["priority"])
	}
}

func TestSearchKnowledgeReturnsResultList(t *testing.T) {
	c, last := stub(t, func(_ captured, w http.ResponseWriter) {
		writeJSON(w, 200, `{"results":[{"filename":"a.md","content":"hello"}]}`)
	})
	rows, err := c.SearchKnowledge("hello", 2, []float64{0.1, 0.2})
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows %#v %v", rows, err)
	}
	if rows[0].(map[string]any)["filename"] != "a.md" {
		t.Fatalf("row %#v", rows[0])
	}
	vec, _ := last.body["vector"].([]any)
	if last.body["query"] != "hello" || last.body["topK"] != float64(2) || len(vec) != 2 {
		t.Fatalf("body %#v", last.body)
	}
}

func TestMcpToolsSendProtocolAndUnwrap(t *testing.T) {
	c, last := stub(t, func(got captured, w http.ResponseWriter) {
		if got.body["method"] == "tools/list" {
			writeJSON(w, 200, `{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"company_status"}]}}`)
			return
		}
		writeJSON(w, 200, `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}`)
	})
	tools, err := c.McpTools()
	if err != nil || tools[0].(map[string]any)["name"] != "company_status" {
		t.Fatalf("tools %#v %v", tools, err)
	}
	if last.path != "/mcp" || last.mcpVer != "2026-07-28" {
		t.Fatalf("mcp %s version %q", last.path, last.mcpVer)
	}
	if _, ok := last.body["params"]; ok {
		t.Fatalf("tools/list must omit params, body %#v", last.body)
	}
	result, err := c.McpToolCall("company_status", nil)
	if err != nil {
		t.Fatal(err)
	}
	content, _ := result["content"].([]any)
	if len(content) != 1 {
		t.Fatalf("result %#v", result)
	}
	if last.body["method"] != "tools/call" {
		t.Fatalf("method %#v", last.body["method"])
	}
}
