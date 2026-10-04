// Listmonk stack worker — a single Cloudflare Container running postgres +
// listmonk + nginx on 127.0.0.1, zero external services (same pattern as
// ops/postiz). State lives in container fs (/data/pg, survives sleep) with
// pg_dumpall snapshots to R2 every 15min (survives eviction).
import { Container } from "@cloudflare/containers";

interface Env {
  LISTMONK: DurableObjectNamespace<ListmonkStack>;
  POSTGRES_LOCAL_PASSWORD?: string;
  LISTMONK_ADMIN_USER?: string;
  LISTMONK_ADMIN_PASSWORD?: string;
  LISTMONK_API_USER?: string;
  LISTMONK_API_TOKEN?: string;
  ADMIN_RESTART_KEY?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET?: string;
}

export class ListmonkStack extends Container {
  defaultPort = 9000; // nginx — proxies to listmonk on 127.0.0.1:9001
  sleepAfter = "30m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Worker secrets reach the container only through envVars.
    this.envVars = {
      R2_BUCKET: env.R2_BUCKET ?? "lazynext-media",
      ...Object.fromEntries(
        [
          "POSTGRES_LOCAL_PASSWORD",
          "LISTMONK_ADMIN_USER",
          "LISTMONK_ADMIN_PASSWORD",
          "LISTMONK_API_USER",
          "LISTMONK_API_TOKEN",
          "R2_ACCESS_KEY_ID",
          "R2_SECRET_ACCESS_KEY",
          "R2_ACCOUNT_ID",
        ]
          .filter((k) => (env as unknown as Record<string, string | undefined>)[k])
          .map((k) => [k, (env as unknown as Record<string, string>)[k]]),
      ),
    };
  }

  // Same secret-rotation escape hatch as postiz-stack: env vars are baked at
  // container start, so `wrangler secret put` needs a restart to land.
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__admin/restart-container") {
      const key = (this.env as Record<string, string | undefined>)
        .ADMIN_RESTART_KEY;
      if (!key || request.headers.get("x-admin-key") !== key) {
        return new Response("forbidden", { status: 403 });
      }
      if (url.searchParams.get("hard") === "1") {
        await this.destroy();
        return new Response("destroyed — next request rebuilds from R2");
      }
      await this.stop();
      return new Response("stopped — next request boots it fresh");
    }
    return super.fetch(request);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const id = env.LISTMONK.idFromName("singleton");
    const stub = env.LISTMONK.get(id);
    return stub.fetch(req);
  },
};
