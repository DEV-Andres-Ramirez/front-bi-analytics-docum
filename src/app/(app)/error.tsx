"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center px-4">
      <div className="card w-full p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-critical-soft text-critical-ink">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted">No fue posible mostrar esta vista. Puedes reintentar o volver al catálogo.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-faint">Ref: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary inline-flex h-10 items-center gap-2 px-5 text-sm">
            <RotateCcw className="size-4" /> Reintentar
          </button>
          <Link href="/" className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-semibold hover:border-primary/40">
            Ir al catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
