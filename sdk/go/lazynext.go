// Package lazynext is a client for the Lazynext API — control the
// autonomous AI company from Go.
package lazynext

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const DefaultBase = "https://ai-company.lazynext.com"

// Client talks to the Lazynext public API.
type Client struct {
	APIKey  string
	BaseURL string
	HTTP    *http.Client
}

func New(apiKey string) *Client {
	return &Client{APIKey: apiKey, BaseURL: DefaultBase, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) get(path string, params url.Values, out any) error {
	u, _ := url.Parse(c.BaseURL + path)
	u.RawQuery = params.Encode()
	req, _ := http.NewRequest("GET", u.String(), nil)
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	r, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("lazynext %d: %s", r.StatusCode, string(b))
	}
	return json.NewDecoder(r.Body).Decode(out)
}

// post sends JSON. extra headers (MCP-Protocol-Version) are optional.
// A nil out skips decoding — the waitlist used to pass nil and then
// json.Decoder.Decode(nil) turned every 200 into "json: Unmarshal(nil)".
func (c *Client) post(path string, body any, out any, headers ...map[string]string) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", c.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	for _, h := range headers {
		for k, v := range h {
			req.Header.Set(k, v)
		}
	}
	r, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		errBody, _ := io.ReadAll(r.Body)
		return fmt.Errorf("lazynext %d: %s", r.StatusCode, string(errBody))
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, r.Body)
		return nil
	}
	return json.NewDecoder(r.Body).Decode(out)
}

func asList(env map[string]any, key string) ([]any, error) {
	raw, ok := env[key]
	if !ok {
		return nil, fmt.Errorf("lazynext: response missing %q", key)
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("lazynext: %q is not a list", key)
	}
	return list, nil
}

func asObject(env map[string]any, key string) (map[string]any, error) {
	raw, ok := env[key].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("lazynext: response missing %q object", key)
	}
	return raw, nil
}

func (c *Client) Health() (map[string]any, error) {
	var out map[string]any
	return out, c.get("/api/v1/health", nil, &out)
}

func (c *Client) Status() (map[string]any, error) {
	var out map[string]any
	return out, c.get("/api/v1/status", nil, &out)
}

// JoinWaitlist posts to the public waitlist. The API returns
// {"ok":true,"seq_sent":bool}; callers need that body, not a decode error.
func (c *Client) JoinWaitlist(email string) (map[string]any, error) {
	var out map[string]any
	err := c.post("/api/v1/waitlist", map[string]string{"email": email}, &out)
	return out, err
}

func (c *Client) ListBriefings(limit int) ([]any, error) {
	var env map[string]any
	if err := c.get("/api/v1/briefings", url.Values{"limit": {fmt.Sprint(limit)}}, &env); err != nil {
		return nil, err
	}
	return asList(env, "briefings")
}

func (c *Client) GetBriefing(id int) (map[string]any, error) {
	var env map[string]any
	if err := c.get(fmt.Sprintf("/api/v1/briefings/%d", id), nil, &env); err != nil {
		return nil, err
	}
	return asObject(env, "briefing")
}

func (c *Client) ListTasks(limit int) ([]any, error) {
	var env map[string]any
	if err := c.get("/api/v1/tasks", url.Values{"limit": {fmt.Sprint(limit)}}, &env); err != nil {
		return nil, err
	}
	return asList(env, "tasks")
}

// CreateTask queues a task. criteria is optional; an empty list is still sent
// so the bus message matches the Python client.
func (c *Client) CreateTask(desc, channel string, priority int, criteria ...[]string) (map[string]any, error) {
	ac := []string{}
	if len(criteria) > 0 && criteria[0] != nil {
		ac = criteria[0]
	}
	var out map[string]any
	err := c.post("/api/v1/tasks", map[string]any{
		"description":         desc,
		"channel":             channel,
		"priority":            priority,
		"acceptance_criteria": ac,
	}, &out)
	return out, err
}

// SearchKnowledge returns the result list, not the {"results":[...]} envelope.
func (c *Client) SearchKnowledge(query string, topK int, vector ...[]float64) ([]any, error) {
	body := map[string]any{"query": query, "topK": topK}
	if len(vector) > 0 && vector[0] != nil {
		body["vector"] = vector[0]
	}
	var env map[string]any
	if err := c.post("/api/v1/knowledge/search", body, &env); err != nil {
		return nil, err
	}
	return asList(env, "results")
}

func (c *Client) ListAgents() ([]any, error) {
	var env map[string]any
	if err := c.get("/api/v1/agents", nil, &env); err != nil {
		return nil, err
	}
	return asList(env, "agents")
}

const mcpProtocolVersion = "2026-07-28"

// McpCall is a raw JSON-RPC POST to /mcp.
func (c *Client) McpCall(method string, params map[string]any, reqID int) (map[string]any, error) {
	body := map[string]any{"jsonrpc": "2.0", "id": reqID, "method": method}
	if params != nil {
		body["params"] = params
	}
	var out map[string]any
	err := c.post("/mcp", body, &out, map[string]string{"MCP-Protocol-Version": mcpProtocolVersion})
	return out, err
}

func (c *Client) McpTools() ([]any, error) {
	env, err := c.McpCall("tools/list", nil, 1)
	if err != nil {
		return nil, err
	}
	result, err := asObject(env, "result")
	if err != nil {
		return nil, err
	}
	return asList(result, "tools")
}

func (c *Client) McpToolCall(name string, args map[string]any) (map[string]any, error) {
	if args == nil {
		args = map[string]any{}
	}
	env, err := c.McpCall("tools/call", map[string]any{"name": name, "arguments": args}, 1)
	if err != nil {
		return nil, err
	}
	return asObject(env, "result")
}
