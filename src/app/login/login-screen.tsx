"use client";

import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  FileText,
  Gavel,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { PositivaLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { login, type LoginState } from "@/server/auth/actions";

const MODULES = [
  { icon: FileText, label: "Facturación" },
  { icon: ShieldCheck, label: "PQRD y Entes de Control" },
  { icon: BarChart3, label: "SMART Supervisión" },
  { icon: Gavel, label: "Tutelas" },
  { icon: Stethoscope, label: "Medicina Laboral" },
  { icon: Mail, label: "Correspondencia" },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function LoginScreen({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const controls = useAnimationControls();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) {
      controls.start({ x: [0, -10, 10, -7, 7, -3, 3, 0], transition: { duration: 0.45 } });
      inputRef.current?.select();
    }
  }, [state.attempt, state.error, controls]);

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <section
        aria-hidden
        className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#e5870f_0%,#c05800_55%,#7a3b00_100%)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[28rem] animate-float rounded-full bg-white/10 blur-3xl" />
          <div
            className="absolute -bottom-32 right-0 size-[32rem] animate-float rounded-full bg-[#ffd9ae]/20 blur-3xl"
            style={{ animationDelay: "-5s" }}
          />
          <svg className="absolute inset-0 size-full opacity-[0.07]" aria-hidden>
            <defs>
              <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M36 0H0V36" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="relative"
        >
          <PositivaLogo mono height={44} className="text-white" />
        </motion.div>

        <div className="relative max-w-xl">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6, ease }}
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur"
          >
            SGDEA · Docum BI
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.7, ease }}
            className="text-balance text-4xl font-bold leading-tight xl:text-5xl"
          >
            Seguimiento de flujos documentales, claro y a tiempo.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.7, ease }}
            className="mt-4 max-w-lg text-base text-white/85"
          >
            13 tableros ejecutivos en un solo lugar, con filtros cruzados, mapas por departamento y municipio,
            y alertas de SLA.
          </motion.p>

          <BrandPreview />
        </div>

        <motion.ul
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } } }}
          className="relative flex flex-wrap gap-2"
        >
          {MODULES.map(({ icon: Icon, label }) => (
            <motion.li
              key={label}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur"
            >
              <Icon className="size-3.5" /> {label}
            </motion.li>
          ))}
        </motion.ul>
      </section>

      {/* Formulario */}
      <section className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mesh-bg pointer-events-none absolute inset-0 lg:hidden" />
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease }}
          className="relative w-full max-w-md"
        >
          <motion.div animate={controls} className="card p-6 sm:p-9">
            <PositivaLogo height={40} priority className="mb-8" />
            <h2 className="text-2xl font-bold tracking-tight">Bienvenido</h2>
            <p className="mt-1.5 text-sm text-muted">
              Ingresa el token de acceso para consultar los tableros de seguimiento.
            </p>

            <form action={action} className="mt-8 space-y-5" noValidate>
              <input type="hidden" name="next" value={next} />
              <div>
                <label htmlFor="token" className="mb-2 block text-sm font-semibold text-text-2">
                  Token de acceso
                </label>
                <div className="group relative">
                  <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-faint transition-colors group-focus-within:text-primary" />
                  <input
                    ref={inputRef}
                    id="token"
                    name="token"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    autoFocus
                    required
                    spellCheck={false}
                    aria-invalid={Boolean(state.error)}
                    aria-describedby={state.error ? "token-error" : undefined}
                    onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
                    onKeyDown={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
                    placeholder="••••••••••••••••"
                    className="h-12 w-full rounded-2xl border border-border bg-surface-2 pl-11 pr-12 font-mono text-[15px] tracking-wide text-text outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-[var(--ring)] aria-[invalid=true]:border-critical"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Ocultar token" : "Mostrar token"}
                    className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text"
                  >
                    {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                  </button>
                </div>
                {caps && (
                  <p className="mt-2 text-xs font-medium text-warning-ink">Bloq Mayús está activado.</p>
                )}
                {state.error && (
                  <motion.p
                    key={state.attempt}
                    id="token-error"
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm font-medium text-critical-ink"
                  >
                    {state.error}
                  </motion.p>
                )}
              </div>

              <button type="submit" disabled={pending} className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-[15px]">
                {pending ? (
                  <>
                    <Loader2 className="size-[18px] animate-spin" /> Validando…
                  </>
                ) : (
                  <>
                    Ingresar <ArrowRight className="size-[18px]" />
                  </>
                )}
              </button>
            </form>
          </motion.div>

          <p className="mt-6 text-center text-xs text-muted">
            Positiva Compañía de Seguros · Uso interno. El acceso queda registrado.
          </p>
        </motion.div>
      </section>
    </main>
  );
}

/** Vista previa animada (decorativa) de un tablero sobre el panel de marca. */
function BrandPreview() {
  const bars = [38, 56, 44, 72, 60, 84, 66, 92];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.8, ease }}
      className="mt-10 grid max-w-lg grid-cols-[1fr_1.3fr] gap-3"
    >
      <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Radicados</p>
        <p className="mt-1 text-3xl font-bold">12.925</p>
        <p className="mt-1 text-xs text-white/80">+5,7 % vs. periodo anterior</p>
        <svg viewBox="0 0 120 36" className="mt-3 h-9 w-full" aria-hidden>
          <motion.path
            d="M0 28 L15 24 L30 26 L45 14 L60 18 L75 9 L90 13 L105 6 L120 8"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.7, duration: 1.4, ease: "easeInOut" }}
          />
        </svg>
      </div>
      <div className="flex h-full min-h-36 items-end gap-1.5 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-t-[4px] bg-white/85"
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: 0.6 + i * 0.07, duration: 0.7, ease }}
            style={{ maxWidth: 18 }}
          />
        ))}
      </div>
    </motion.div>
  );
}
