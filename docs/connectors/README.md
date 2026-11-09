# Connectors

Per-connector documentation. The registry itself is code — this directory
explains the parts that are easy to get wrong: credential shapes, what a
connector can and cannot do, and what is deliberately *not* connected.

| Connector | Status | Doc |
|---|---|---|
| LinkedIn | **Not connected.** Dispatch code shipped; credential absent; provider gate closed. | [linkedin.md](./linkedin.md) |

## Where the truth lives

| Question | Answer | Source of truth |
|---|---|---|
| Which connectors exist? | 45 ids | `CONNECTOR_IDS` in `worker/src/services.ts`, mirrored by `_DISPATCH` in `core/tools/connectors.py` |
| How does one authenticate? | `auth_kind` | `CONNECTOR_CAPABILITIES` in `worker/src/capabilities.ts`, mirrored by `core/tools/connector_capabilities.py` |
| Is one connected right now? | `configured` | derived from credential presence (`conn:<id>` in KV, or `CONN_<ID>`) — **never** hardcoded |
| Can I preview a dispatch? | `supports_dry_run` | same capability table |
| What does the payload look like? | the connector's `callConnector` / `_DISPATCH` branch | `worker/src/services.ts`, `core/tools/connectors.py` |

Four lists must stay in sync (`CONNECTOR_IDS`, `_DISPATCH`, and the two
capability tables). Two tests enforce it:

- `worker/test/connector-capabilities.test.mjs` — capability ids ↔
  `CONNECTOR_IDS`, both directions.
- `tests/unit/test_connector_capabilities.py` — capability ids ↔ `_DISPATCH`,
  **and** field-by-field parity between the TypeScript and Python tables (the
  suite parses the shipped `.ts` file).

## Reading a connector's state

```bash
# which connectors exist + how they authenticate + whether they are configured
curl -s https://ai-company.lazynext.com/api/v1/connectors \
  -H "authorization: Bearer $LAZYNEXT_API_KEY" | jq '.capabilities.linkedin'
```

`capabilities` is additive — `connectors` keeps its original
`{id: boolean}` shape for existing callers.

## Previewing without sending

`POST /api/v1/connectors/{id}` accepts `dry_run: true`, and
`core/tools/connectors.py` accepts `dry_run=True`. Both return the exact
request(s) that would be sent — method, URL, headers, body — with credentials
redacted, and make **zero** provider calls. See
[dry-run.md](./dry-run.md) for the exact contract, including which connectors
refuse and why.

## Coverage audit

`docs/connectors.md` (one directory up) is the broader coverage audit: which
platforms have a first-class API, which go through an aggregator, which have
no programmatic write path at all, and the provider-API drift log.
