// Postiz stack worker — a single Cloudflare Container running the fat
// all-in-one image: postgres + redis + temporal + postiz-app, all on
// 127.0.0.1 inside the container. ZERO external services: state lives in
// the container fs (survives sleep) with pg_dumpall snapshots to R2 every
// 15min (survives eviction). The worker's only job: wake + fetch.
import { Container } from "@cloudflare/containers";

interface Env {
  POSTIZ: DurableObjectNamespace<PostizStack2>;
  JWT_SECRET?: string;
  POSTGRES_LOCAL_PASSWORD?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ACCESS_KEY?: string;
  CLOUDFLARE_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_BUCKETNAME?: string;
  CLOUDFLARE_BUCKET_URL?: string;
  CLOUDFLARE_REGION?: string;
  POSTIZ_CMD?: string;
}

export class PostizStack2 extends Container {
  defaultPort = 5000; // postiz-app bundled FE+BE port
  sleepAfter = "30m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Worker secrets reach the container only through envVars — merge them
    // here (static config + whatever the operator set via wrangler secret).
    this.envVars = {
      MAIN_URL: "https://postiz.lazynext.com",
      FRONTEND_URL: "https://postiz.lazynext.com",
      NEXT_PUBLIC_BACKEND_URL: "https://postiz.lazynext.com/api",
      BACKEND_INTERNAL_URL: "http://127.0.0.1:3000",
      IS_GENERAL: "true",
      DISABLE_REGISTRATION: "true", // single-tenant: founder only
      RUN_CRON: "true",
      STORAGE_PROVIDER: "cloudflare",
      // Escape hatch: POSTIZ_CMD overrides the app launch command baked into
      // /opt/postiz-run.sh (entrypoint line `exec sh -c "${POSTIZ_CMD:-pnpm
      // run pm2}"`). Used for one-shot boot SQL — the cmd must end with
      // `; exec pnpm run pm2` or the app never starts.
      ...(env.POSTIZ_CMD ? { POSTIZ_CMD: env.POSTIZ_CMD } : {}),
      TEMPORAL_NAMESPACE: "default",
      R2_BUCKET: env.R2_BUCKET ?? "lazynext-media",
      ...(env.JWT_SECRET ? { JWT_SECRET: env.JWT_SECRET } : {}),
      ...(env.POSTGRES_LOCAL_PASSWORD
        ? { POSTGRES_LOCAL_PASSWORD: env.POSTGRES_LOCAL_PASSWORD }
        : {}),
      ...(env.R2_ACCESS_KEY_ID ? { R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID } : {}),
      ...(env.R2_SECRET_ACCESS_KEY
        ? { R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY }
        : {}),
      ...(env.R2_ACCOUNT_ID ? { R2_ACCOUNT_ID: env.R2_ACCOUNT_ID } : {}),
      // Postiz's own R2 uploader config (same creds, its env names)
      ...(env.CLOUDFLARE_ACCOUNT_ID ? { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID } : {}),
      ...(env.CLOUDFLARE_ACCESS_KEY ? { CLOUDFLARE_ACCESS_KEY: env.CLOUDFLARE_ACCESS_KEY } : {}),
      ...(env.CLOUDFLARE_SECRET_ACCESS_KEY ? { CLOUDFLARE_SECRET_ACCESS_KEY: env.CLOUDFLARE_SECRET_ACCESS_KEY } : {}),
      ...(env.CLOUDFLARE_BUCKETNAME ? { CLOUDFLARE_BUCKETNAME: env.CLOUDFLARE_BUCKETNAME } : {}),
      ...(env.CLOUDFLARE_BUCKET_URL ? { CLOUDFLARE_BUCKET_URL: env.CLOUDFLARE_BUCKET_URL } : {}),
      ...(env.CLOUDFLARE_REGION ? { CLOUDFLARE_REGION: env.CLOUDFLARE_REGION } : {}),
      // Social-provider OAuth creds — every `wrangler secret put <NAME>` value
      // is forwarded to the container so channels light up as keys arrive.
      // Names match postiz-app's .env.example exactly.
      ...Object.fromEntries(
        [
          "X_URL", "X_API_KEY", "X_API_SECRET",
          "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET",
          "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET",
          "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
          "BEEHIIVE_API_KEY", "LISTMONK_API_KEY",
          "THREADS_APP_ID", "THREADS_APP_SECRET",
          "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET",
          "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET",
          "TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET",
          "TIKTOK_BUSINESS_CLIENT_ID", "TIKTOK_BUSINESS_CLIENT_SECRET",
          "PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET",
          "DRIBBBLE_CLIENT_ID", "DRIBBBLE_CLIENT_SECRET",
          "TUMBLR_CLIENT_ID", "TUMBLR_CLIENT_SECRET",
          "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN_ID",
          "SLACK_ID", "SLACK_SECRET", "SLACK_SIGNING_SECRET",
          "MASTODON_URL", "MASTODON_CLIENT_ID", "MASTODON_CLIENT_SECRET",
          "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET",
          "GOOGLE_GMB_CLIENT_ID", "GOOGLE_GMB_CLIENT_SECRET",
          "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET",
          "KICK_CLIENT_ID", "KICK_SECRET", "VK_ID", "WHOP_CLIENT_ID",
          "WHOP_CLIENT_SECRET",
          "MEWE_APP_ID", "MEWE_API_KEY", "MEWE_HOST",
          "NEYNAR_APP_FID", "NEYNAR_APP_MNEMONIC", "NEYNAR_CLIENT_ID",
          "NEYNAR_SECRET_KEY", "NEYNAR_SPONSOR_SIGNERS",
          "TELEGRAM_TOKEN",
          "RESEND_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_FROM_NAME",
          "OPENAI_API_KEY", "DEEPGRAM_API_KEY",
        ]
          .filter((k) => (env as unknown as Record<string, string | undefined>)[k])
          .map((k) => [k, (env as unknown as Record<string, string>)[k]]),
      ),
    };
  }

  // Secret rotation path: env vars are baked into the container process at
  // start, so `wrangler secret put` alone never reaches a running container.
  // POST /__admin/restart-container (header x-admin-key = ADMIN_RESTART_KEY
  // worker secret) SIGTERMs it — the fs survives (same as the sleepAfter
  // path) and the next request boots it with the current envVars.
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__admin/restart-container") {
      const key = (this.env as Record<string, string | undefined>)
        .ADMIN_RESTART_KEY;
      if (!key || request.headers.get("x-admin-key") !== key) {
        return new Response("forbidden", { status: 403 });
      }
      // ?hard=1 destroys the container outright — fs is wiped and the
      // entrypoint's r2-restore.sh rebuilds pg from the latest R2 snapshot.
      // Use when a wedged boot (dead pg/temporal) survives a plain restart.
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
    // One instance is enough — single-tenant scheduler, not a fleet.
    // Bumped to singleton2 on 2026-10-02: a wedged boot left corrupt pg data
    // on /data and container destroy() preserved the fs, so a fresh DO
    // instance (= fresh container fs) was the only way to reach r2-restore.
    const id = env.POSTIZ.idFromName("singleton2");
    const stub = env.POSTIZ.get(id);
    return stub.fetch(req);
  },
};
