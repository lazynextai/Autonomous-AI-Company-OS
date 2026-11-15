"use client";

import { useState } from "react";
import { Card, Empty, timeAgo } from "@/components/ui";
import { Pill } from "./Pill";
import { useGov } from "./useGov";
import {
  govPost,
  type LatestManifestResponse,
  type ManifestActivateResponse,
  type ManifestValidateResponse,
  type TemplatePackSummary,
  type TemplatesResponse,
} from "@/lib/governance";
import { toast } from "@/components/Toast";
import { Layers, CheckCircle2, Play } from "lucide-react";

interface PendingActivate {
  name: string;
  version: number;
  packName: string;
}

function roleCount(body: Record<string, unknown> | undefined): number {
  return Array.isArray(body?.roles) ? body.roles.length : 0;
}

function goalCount(body: Record<string, unknown> | undefined): number {
  return Array.isArray(body?.goals) ? body.goals.length : 0;
}

function connectorCount(body: Record<string, unknown> | undefined): number {
  const perms = body?.connector_permissions;
  return perms && typeof perms === "object" && !Array.isArray(perms)
    ? Object.keys(perms).length
    : 0;
}

export function TemplatesPanel() {
  const packs = useGov<TemplatesResponse>("/templates?include_body=1");
  const latest = useGov<LatestManifestResponse>("/manifests/latest");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingActivate | null>(null);
  const [lastNote, setLastNote] = useState("");

  const list = packs.data?.packs ?? [];
  const active = latest.data?.active ?? null;

  const validatePack = async (pack: TemplatePackSummary) => {
    if (!pack.body) {
      toast("Pack body missing — reload and try again");
      return;
    }
    setBusy(pack.name);
    setPending(null);
    setLastNote("");
    try {
      const res = await govPost<ManifestValidateResponse>("/manifests/validate", pack.body);
      if (!res.ok) {
        toast(`Validation failed: ${(res.errors ?? []).join("; ") || "invalid"}`);
        setLastNote((res.errors ?? []).join("; "));
        return;
      }
      setPending({ name: res.name, version: res.version, packName: pack.name });
      setLastNote(res.note ?? `Validated ${res.name}@${res.version} — not activated.`);
      toast(`Validated ${res.name}@${res.version}. Activate explicitly if you want it live.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Validate failed");
    } finally {
      setBusy(null);
    }
  };

  const activatePending = async () => {
    if (!pending) return;
    const label = `${pending.name}@${pending.version}`;
    const ok = window.confirm(
      `Activate company template ${label}?\n\nThis calls POST /manifests/activate. Nothing auto-activates — only this confirm does.`,
    );
    if (!ok) return;
    setBusy(pending.packName);
    try {
      const res = await govPost<ManifestActivateResponse>("/manifests/activate", {
        name: pending.name,
        version: pending.version,
      });
      if (!res.ok) {
        toast(res.error ?? "Activate failed");
        return;
      }
      toast(`Activated ${res.name}@${res.version}`);
      setPending(null);
      setLastNote(`Active: ${res.name}@${res.version}`);
      window.setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Layers className="w-4 h-4 text-accentSoft" /> Company template packs
          </h2>
          <p className="text-xs text-muted mt-1">
            Starter manifests from GET /templates. Activation is copy → validate → activate —
            nothing auto-activates from this panel.
          </p>
        </div>
        <span className="text-[10px] text-muted shrink-0">{list.length} packs</span>
      </div>

      {active && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
          <Pill tone="ok">active</Pill>
          <span className="font-mono text-fg">
            {active.name}@{active.version}
          </span>
          <span className="text-muted">since {timeAgo(active.created_at)}</span>
        </div>
      )}
      {latest.data && !active && (
        <p className="text-xs text-muted mt-3">No active manifest pointer yet.</p>
      )}

      {packs.error && (
        <p className="text-xs text-bad mt-3">Could not load templates: {packs.error}</p>
      )}
      {latest.error && (
        <p className="text-xs text-bad mt-3">Could not load active manifest: {latest.error}</p>
      )}
      {packs.loading && !packs.data && (
        <p className="text-xs text-muted mt-3">Loading template packs…</p>
      )}

      {packs.data && list.length === 0 && (
        <div className="mt-4">
          <Empty title="No template packs" hint="The worker catalogue returned an empty packs list." />
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-4 space-y-3">
          {list.map((pack) => {
            const isActive =
              active?.name === pack.name && Number(active?.version) === Number(pack.version);
            const isPending = pending?.packName === pack.name;
            return (
              <div
                key={pack.name}
                className="border border-border rounded-lg px-4 py-3 space-y-2"
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-fg font-mono">{pack.name}</span>
                      <span className="text-[10px] text-muted">v{pack.version}</span>
                      {isActive && <Pill tone="ok">active</Pill>}
                    </div>
                    <p className="text-xs text-muted mt-1">{pack.description || "No description."}</p>
                    <p className="text-[10px] text-muted mt-1">
                      {goalCount(pack.body)} goals · {roleCount(pack.body)} roles ·{" "}
                      {connectorCount(pack.body)} connector permissions
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy === pack.name}
                      onClick={() => validatePack(pack)}
                      className="inline-flex items-center gap-1.5 bg-card hover:bg-cardHover border border-border text-fg text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-accentSoft" />
                      Validate &amp; store
                    </button>
                    {isPending && pending && (
                      <button
                        type="button"
                        disabled={busy === pack.name}
                        onClick={activatePending}
                        className="inline-flex items-center gap-1.5 bg-accent hover:bg-accentSoft text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Activate {pending.name}@{pending.version}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastNote && <p className="text-xs text-fg/80 mt-3">{lastNote}</p>}

      <p className="text-[10px] text-muted mt-3">
        Validate calls POST /manifests/validate (stores a version, never activates). Activate is a
        separate confirm that calls POST /manifests/activate with the stored name@version.
      </p>
    </Card>
  );
}
