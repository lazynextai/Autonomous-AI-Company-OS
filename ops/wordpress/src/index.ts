// WordPress blog worker — one Cloudflare Container running the patched
// wordpress:apache image (sqlite dropin baked into wp-config — no MySQL).
// WP lives on the container fs; first boot seeds /var/www/html.
import { Container } from "@cloudflare/containers";

interface Env {
  WP: DurableObjectNamespace<WordpressBlog>;
  EPHEMERAL: KVNamespace;
}

export class WordpressBlog extends Container {
  defaultPort = 3000; // apache
  sleepAfter = "30m";

  override async fetch(request: Request): Promise<Response> {
    // Debug: report the URL the DO receives across the stub boundary.
    const u = new URL(request.url);
    if (u.searchParams.get("__echo") === "1") {
      return new Response(`DO sees: ${request.url}\n`);
    }
    // Bypass Container.containerFetch: the runtime's health-check follows
    // redirects and newer hosts reject the https Request carried as fetch
    // init. Start the container ourselves, poll the port with a plain
    // RequestInit (no Request object), never follow upstream redirects.
    if (!this.container.running) {
      await this.container.start();
      const p = this.container.getTcpPort(this.defaultPort);
      let up = false;
      for (let i = 0; i < 90; i++) {
        try {
          await p.fetch("http://containerstarthealthcheck/", { redirect: "manual" });
          up = true;
          break;
        } catch {
          if (this.container.running) { await new Promise(r => setTimeout(r, 1000)); continue; }
          break;
        }
      }
      if (!up) return new Response("container port never listened", { status: 503 });
    }
    const httpUrl = request.url.replace(/^https:/, "http:");
    if (u.searchParams.get("__auth") !== null) {
      return new Response(`auth-in-DO: ${request.headers.get("authorization") ?? "absent"}\n`);
    }
    const fwd = new Headers(request.headers);
    fwd.set("X-Forwarded-Proto", "https");
    const port = this.container.getTcpPort(this.defaultPort);
    const body = request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
    return port.fetch(httpUrl, {
      method: request.method,
      headers: fwd,
      body,
      redirect: "manual",
    });
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = {};
  }
}

// Returned when a browser GET catches the container mid-boot (~45-75s cold
// start). The DO-side boot keeps running after we answer, so the client's
// refresh lands on a warm container. 503 + Retry-After keeps crawlers from
// indexing the placeholder while meta refresh recovers real visitors.
const WARMING_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="15">
<title>Lazynext Blog</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0a0a0f;color:#f5f5f7;font-family:system-ui,sans-serif;text-align:center}
h1{font-weight:600;font-size:1.4rem}p{color:#9696a0;font-size:.95rem}
</style></head><body><div><h1>Lazynext</h1>
<p>The blog is warming up — this page reloads automatically.</p></div></body></html>`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/__beacon") {
      // boot-stage telemetry from inside the container — start.sh PUTs its
      // stage here so we can see where boot dies on cold start.
      const s = url.searchParams.get("s") || "?";
      await env.EPHEMERAL.put("wpboot:last", s, { expirationTtl: 3600 });
      await env.EPHEMERAL.put(`wpboot:${s}`, new Date().toISOString(), { expirationTtl: 3600 });
      return new Response("ok");
    }
    // Diagnostics: rewrite to http before the DO — the container tunnel
    // speaks plain HTTP and newer runtimes reject https in the fetch init.
    if (url.searchParams.get("__echo") === "1") {
      url.protocol = "http:";
      req = new Request(url.toString(), req);
    }
    const id = env.WP.idFromName("singleton");
    const stub = env.WP.get(id);
    const browserGet =
      (req.method === "GET" || req.method === "HEAD") &&
      (req.headers.get("accept") ?? "").includes("text/html");
    if (!browserGet) return stub.fetch(req);
    const upstream = stub
      .fetch(req)
      .catch(() => new Response("upstream unavailable", { status: 502 }));
    const slow = new Promise<Response>((resolve) =>
      setTimeout(
        () =>
          resolve(
            new Response(WARMING_PAGE, {
              status: 503,
              headers: {
                "content-type": "text/html; charset=utf-8",
                "retry-after": "60",
                "cache-control": "no-store",
              },
            }),
          ),
        20000,
      ),
    );
    return Promise.race([upstream, slow]);
  },
};
