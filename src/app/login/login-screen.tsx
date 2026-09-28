"use client";

import { ArrowRight, CircleHelp, Eye, EyeOff, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { PositivaLogo } from "@/components/brand/logo";
import { ColombiaDots } from "@/components/home/colombia-dots";
import { ThemeSwitch } from "@/components/ui/theme-toggle";
import { DASHBOARDS, MODULES } from "@/config/dashboards";
import { login, type LoginState } from "@/server/auth/actions";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Tableros por módulo (sale de la configuración; nada de cifras inventadas). */
const MODULE_TILES = MODULES.map((m) => ({ ...m, count: DASHBOARDS.filter((d) => d.module === m.id).length }));

/**
 * Degradado de marca del panel (chrome, no datos). Arranca en un naranja Balú más profundo para que el texto
 * blanco de 12–16 px cumpla AA (≥ 4,5:1) incluso sobre un punto de la silueta; el titular (texto grande) cumple 3:1.
 */
const BRAND_BG = "linear-gradient(150deg, #bd5d00 0%, #a24a00 58%, #6b3000 100%)";

/**
 * LoginScreen v2.
 * - Escritorio (≥ 1024 px): grid 1.1fr / 1fr. Panel naranja con la silueta de Colombia en puntos (blanco al 12 %)
 *   y mosaico 2×3 de módulos (círculo blanco con el ícono en el color del módulo, nombre y "n tableros").
 * - Móvil y tablet: banda de 168 px con el titular alineado a la tarjeta, que va superpuesta (−mt-10). En tablet
 *   (768–1023 px) el mosaico de módulos baja, compacto, bajo la tarjeta (conserva el contexto del escritorio).
 * - Tarjeta: lockup "Docum BI" (el logo aparece una sola vez), token con mostrar/ocultar, aviso de Bloq Mayús,
 *   error con role=alert (con sacudida) y ayuda para obtener el token.
 */
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
    <main className="relative grid min-h-dvh bg-bg lg:grid-cols-[1.1fr_1fr]">
      {/* ── Panel de marca (escritorio) ─────────────────────────────── */}
      <aside
        aria-label="Acerca de Docum BI"
        className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:px-12 lg:py-11 xl:px-16"
        style={{ background: BRAND_BG }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/0 dark:bg-black/15" />
        {/* Silueta completa en el tercio derecho, desvanecida hacia el texto para no competir con él. */}
        <ColombiaDots
          dot={1}
          className="absolute right-[-6%] top-1/2 h-[70%] -translate-y-1/2 text-white/10 [mask-image:linear-gradient(to_right,transparent_0,#000_60%)] xl:h-[82%]"
        />

        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="relative inline-flex w-fit items-center gap-2 rounded-full bg-black/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ring-white/25"
        >
          SGDEA · Seguimiento documental
        </motion.p>

        <div className="relative my-auto max-w-xl py-10">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.5, ease: EASE }}
            className="text-balance text-4xl font-bold leading-[1.15] tracking-tight xl:text-[44px]"
          >
            Seguimiento de flujos documentales, claro y a tiempo.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.5, ease: EASE }}
            className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-white"
          >
            {DASHBOARDS.length} tableros en {MODULES.length} módulos, con filtros cruzados, mapas por departamento y municipio, y
            alertas de términos.
          </motion.p>

          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04, delayChildren: 0.2 } } }}
            className="mt-9 grid max-w-lg grid-cols-2 gap-3"
            aria-label="Módulos"
          >
            {MODULE_TILES.map((m) => {
              const Icon = m.icon;
              return (
                <motion.li
                  key={m.id}
                  data-module={m.id}
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }}
                  className="flex items-center gap-3 rounded-2xl bg-black/10 p-3 ring-1 ring-white/25 backdrop-blur-sm"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-mod-2 shadow-[0_6px_16px_-8px_rgb(0_0_0/0.45)]">
                    <Icon className="size-5" aria-hidden strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-5">{m.short}</span>
                    <span className="block text-xs font-medium leading-4 text-white">
                      {m.count} {m.count === 1 ? "tablero" : "tableros"}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        </div>

      </aside>

      {/* ── Formulario ─────────────────────────────────────────────── */}
      <section className="relative flex min-w-0 flex-col lg:items-center lg:justify-center lg:px-8 lg:py-10">
        {/* Banda móvil de 168 px */}
        <div aria-hidden className="relative h-[168px] overflow-hidden lg:hidden" style={{ background: BRAND_BG }}>
          <ColombiaDots dot={1.1} className="absolute -right-6 -top-10 h-[260px] text-white/15" />
          {/* Mismo ancho y margen que la tarjeta: el titular arranca en su borde izquierdo. */}
          <div className="absolute inset-x-0 bottom-14">
            <p className="mx-auto max-w-md text-balance px-4 pr-20 text-lg font-bold leading-snug text-white sm:px-6 sm:pr-24">
              Seguimiento de flujos documentales, claro y a tiempo.
            </p>
          </div>
        </div>

        <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
          <ThemeSwitch />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="relative z-[1] mx-auto -mt-10 w-full max-w-md px-4 pb-10 sm:px-6 lg:mt-0 lg:px-0 lg:pb-0"
        >
          <motion.div animate={controls} className="card-hero p-6 sm:p-8">
            {/* Lockup: logo (única vez) | Docum BI */}
            <div className="flex items-center gap-3">
              <PositivaLogo height={30} priority />
              <span aria-hidden className="h-7 w-px bg-border" />
              <span className="text-sm font-bold tracking-tight text-text">Docum BI</span>
            </div>

            <h1 className="mt-7 text-2xl font-bold tracking-tight text-text">Te damos la bienvenida</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">Ingresa el token de acceso para consultar los tableros de seguimiento.</p>

            <form action={action} className="mt-7 space-y-5" noValidate>
              <input type="hidden" name="next" value={next} />
              <div>
                <label htmlFor="token" className="mb-2 block text-sm font-semibold text-text-2">
                  Token de acceso
                </label>
                <div className="group relative">
                  <KeyRound
                    className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary"
                    aria-hidden
                  />
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
                    aria-describedby={[state.error ? "token-error" : null, caps ? "token-caps" : null].filter(Boolean).join(" ") || undefined}
                    onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
                    onKeyDown={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
                    onBlur={() => setCaps(false)}
                    placeholder="Pega aquí tu token"
                    className="h-12 w-full rounded-2xl border border-border bg-surface-2 pl-11 pr-12 font-mono text-[15px] tracking-wide text-text outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-muted focus:border-primary focus:bg-surface focus:ring-4 focus:ring-[var(--ring)] aria-[invalid=true]:border-critical"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Ocultar token" : "Mostrar token"}
                    aria-pressed={show}
                    className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text"
                  >
                    {show ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
                  </button>
                </div>
                {caps && (
                  <p id="token-caps" role="status" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-ink">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    Bloq Mayús está activado.
                  </p>
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
                    <Loader2 className="size-[18px] animate-spin" aria-hidden /> Validando…
                  </>
                ) : (
                  <>
                    Ingresar <ArrowRight className="size-[18px]" aria-hidden />
                  </>
                )}
              </button>
            </form>

            {/* Ayuda para obtener el token (copy por validar con el negocio) */}
            <details className="group mt-6 rounded-xl border border-border bg-surface-2 text-sm open:bg-surface-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 font-semibold text-text-2 transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
                <CircleHelp className="size-4 shrink-0 text-muted" aria-hidden />
                ¿No tienes un token de acceso?
                <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <div className="space-y-1.5 px-3.5 pb-3 text-[13px] leading-relaxed text-text-2">
                <p>Solicítalo al administrador de Docum BI de tu área (Gestión Documental).</p>
                <p className="text-muted">El token es personal: no lo compartas ni lo envíes por correo o chat.</p>
              </div>
            </details>
          </motion.div>

          {/* Tablet (768–1023 px): mosaico compacto de módulos bajo la tarjeta, sobre la superficie (sin cifras inventadas). */}
          <ul aria-label="Módulos" className="mt-6 hidden grid-cols-2 gap-2 md:grid lg:hidden">
            {MODULE_TILES.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.id} data-module={m.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mod-soft text-mod-ink">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold leading-4 text-text">{m.short}</span>
                    <span className="block text-xs leading-4 text-muted">
                      {m.count} {m.count === 1 ? "tablero" : "tableros"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Único pie legal (el panel de marca ya no lo repite). */}
          <p className="mt-6 text-balance text-center text-xs text-muted">
            <span className="whitespace-nowrap">Positiva Compañía de Seguros · Uso interno.</span>{" "}
            <span className="whitespace-nowrap">El acceso queda registrado.</span>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
