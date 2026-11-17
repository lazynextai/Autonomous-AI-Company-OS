"use strict";
// A deliberately sloppy-looking landing hero component (design tells via
// Tailwind class strings, as kill-ai-slop's scanner reads from source).

export function Hero() {
  return (
    <section className="bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-purple-500/50">
      <span className="uppercase tracking-widest text-indigo-500">Features</span>
      <h1 className="bg-clip-text text-transparent font-extrabold text-6xl tracking-tight">
        We help modern teams unlock the power of seamless workflows
      </h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-indigo-100 p-2">
          <h3>Fast</h3>
          <p className="text-sm">Very fast.</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <h3>Secure</h3>
          <p className="text-sm">Safe.</p>
        </div>
        <div className="rounded-xl bg-amber-100 p-2">
          <h3>Scalable</h3>
          <p className="text-sm">It grows.</p>
        </div>
      </div>
    </section>
  );
}