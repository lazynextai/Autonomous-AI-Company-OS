import { ReactNode } from "react";

export type Tone = "ok" | "warn" | "bad" | "accent" | "muted";

const TONES: Record<Tone, string> = {
  ok: "bg-okBg text-ok",
  warn: "bg-warnBg text-warn",
  bad: "bg-badBg text-bad",
  accent: "bg-accentBg text-accentSoft",
  muted: "bg-input text-muted",
};

export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
