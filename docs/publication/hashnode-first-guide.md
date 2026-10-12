# Lazynext Accessibility Checker: REST, MCP and A2A

Lazynext brings AI agents into engineering, growth, sales and company operations. Our accessibility checker is one practical part of that work: it exposes the same scan pipeline through REST, MCP and A2A.

## Start with the web app

Open [checker.lazynext.com](https://checker.lazynext.com) to scan a website and view its report. Developers can inspect the [OpenAPI document](https://api.lazynext.com/openapi.json) for the HTTP contract.

## Connect an agent with MCP

The MCP endpoint is `POST https://api.lazynext.com/mcp`. It accepts JSON-RPC requests and exposes four tools:

- `scan_url` scans a website URL.
- `scan_html` checks supplied HTML markup.
- `get_report` retrieves a stored report.
- `list_rules` returns the scanner rule manifest.

This implementation returns JSON responses to individual POST requests. It does not provide an SSE stream. Clients should inspect scan results for an `error` field as well as checking the JSON-RPC envelope.

## Use A2A for task-shaped results

The [agent card](https://api.lazynext.com/.well-known/agent.json) describes the A2A surface. `POST /a2a` supports `message/send`, the `tasks/send` alias and `tasks/get`. A successful scan returns a completed task containing the accessibility report; its task ID is also the report ID.

REST, MCP and A2A share the scanner, URL-scan quota and report store. Switching protocols keeps the same underlying scan behavior.

## Follow our progress

This publication will share product updates and practical engineering notes from Lazynext. Visit [lazynext.com](https://lazynext.com) or contact [support@lazynext.com](mailto:support@lazynext.com).
