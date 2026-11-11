"use client";

import { useEffect, useState } from "react";

export default function Splash() {
  // The initial state MUST equal the server render (false) — reading
  // sessionStorage in a useState initializer made the client's first paint
  // differ from the prerendered HTML on every visit after the first, which is
  // what threw React #418 (hydration mismatch) on all 33 pages. The
  // session flag is applied in the effect below, after hydration.
  const [gone, setGone] = useState<boolean>(false);

  useEffect(() => {
    if (sessionStorage.getItem("lz_splashed")) {
      setGone(true); // seen already this session: dismiss on mount
      return;
    }
    sessionStorage.setItem("lz_splashed", "1");
    const t = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (gone) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center animate-[fadeout_.4s_ease_.5s_forwards]">
      <div className="text-3xl font-bold text-fg animate-pulse">
        <span className="text-accentSoft">◆</span> Lazynext
      </div>
      <div className="text-xs text-muted mt-3">booting your company…</div>
      <style>{`@keyframes fadeout{to{opacity:0;visibility:hidden}}`}</style>
    </div>
  );
}
