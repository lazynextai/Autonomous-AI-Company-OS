"use client";

import { useEffect, useState } from "react";

export default function Splash() {
  const [gone, setGone] = useState<boolean>(() =>
    typeof window !== "undefined" && !!sessionStorage.getItem("lz_splashed")
  );

  useEffect(() => {
    if (gone) return; // already seen this session — initializer handled it
    sessionStorage.setItem("lz_splashed", "1");
    const t = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(t);
  }, [gone]);

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
