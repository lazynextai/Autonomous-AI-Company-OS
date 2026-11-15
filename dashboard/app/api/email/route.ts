import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";
import {
  emailRecipientAllowed,
  hasMutateConfirm,
} from "@/lib/blast_radius";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasMutateConfirm(req.headers)) {
    return NextResponse.json(
      { error: "email send requires x-lz-confirm: mutate" },
      { status: 403 },
    );
  }
  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { to, subject, html } = body;
  if (
    typeof to !== "string" ||
    typeof subject !== "string" ||
    typeof html !== "string" ||
    !to ||
    !subject ||
    !html
  ) {
    return NextResponse.json(
      { error: "to, subject, html required" },
      { status: 400 },
    );
  }
  if (!emailRecipientAllowed(to)) {
    return NextResponse.json(
      { error: "recipient domain not allowlisted (lazynext.com only)" },
      { status: 400 },
    );
  }
  const r = await workerFetch("/email/send", { to, subject, html });
  return NextResponse.json(await r.json(), { status: r.status });
}
