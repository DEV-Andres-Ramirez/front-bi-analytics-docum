import Link from "next/link";
import { PositivaLogo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="mesh-bg grid min-h-dvh place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <PositivaLogo height={34} className="mx-auto mb-6" />
        <p className="text-5xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-xl font-bold">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-muted">El tablero o la ruta que buscas no existe o cambió de nombre.</p>
        <Link href="/" className="btn-primary mt-6 inline-flex h-11 items-center px-6 text-sm">
          Volver al catálogo
        </Link>
      </div>
    </main>
  );
}
