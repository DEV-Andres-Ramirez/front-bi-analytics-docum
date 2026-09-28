import Image from "next/image";
import { cn } from "@/lib/cn";

const SRC = "/graphic_identity/positiva_logo.svg";
const RATIO = 1051.67 / 255.12;

interface Props {
  className?: string;
  /** Monocromático: toma el color de texto actual (útil sobre fondos naranja). */
  mono?: boolean;
  height?: number;
  priority?: boolean;
}

/** Logo oficial de Positiva Compañía de Seguros. */
export function PositivaLogo({ className, mono, height = 40, priority }: Props) {
  if (mono) {
    return (
      <span
        role="img"
        aria-label="Positiva Compañía de Seguros"
        className={cn("inline-block bg-current", className)}
        style={{
          height,
          width: height * RATIO,
          WebkitMask: `url(${SRC}) no-repeat center / contain`,
          mask: `url(${SRC}) no-repeat center / contain`,
        }}
      />
    );
  }
  return (
    <Image
      src={SRC}
      alt="Positiva Compañía de Seguros"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      unoptimized
      className={cn("h-auto select-none", className)}
      style={{ height, width: "auto" }}
    />
  );
}

/** Isotipo compacto (sidebar colapsado): recorte del símbolo del logo. */
export function PositivaMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span
      role="img"
      aria-label="Positiva"
      className={cn("inline-block overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="block bg-current"
        style={{
          height: size,
          width: size * RATIO,
          WebkitMask: `url(${SRC}) no-repeat left center / contain`,
          mask: `url(${SRC}) no-repeat left center / contain`,
        }}
      />
    </span>
  );
}
