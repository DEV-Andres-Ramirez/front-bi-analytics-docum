/**
 * Exportación PNG compuesta del HeroMap (mapRedesign 12): título, lienzo, leyenda y top 5
 * dibujados en un canvas 2D. El lienzo de Mapbox se captura dentro del evento "render"
 * (no hace falta preserveDrawingBuffer permanente).
 */

export interface ExportInput {
  title: string;
  subtitle: string;
  map: { url: string; width: number; height: number } | null;
  legendTitle: string;
  classes: { color: string; label: string }[];
  noDataColor: string;
  top: { name: string; value: string; share: string; color: string }[];
  footer?: string;
  colors: { bg: string; text: string; text2: string; muted: string; border: string; surface2: string };
  fontFamily: string;
}

const SCALE = 2;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Envuelve texto a un ancho máximo (en px lógicos). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function composeMapPng(input: ExportInput): Promise<string | null> {
  const { colors, fontFamily } = input;
  const img = input.map ? await loadImage(input.map.url) : null;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  // Lienzo en px lógicos (el canvas de Mapbox viene en px de dispositivo)
  const mapW = img && input.map ? Math.round(input.map.width / dpr) : 420;
  const mapH = img && input.map ? Math.round(input.map.height / dpr) : 480;
  const pad = 28;
  const side = 300;
  const gap = 28;
  const headH = 64;
  const W = pad + mapW + gap + side + pad;
  const H = pad + headH + Math.max(mapH, 420) + (input.footer ? 28 : 0) + pad;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  const font = (w: number, size: number) => `${w} ${size}px ${fontFamily}`;

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Encabezado
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colors.text;
  ctx.font = font(700, 20);
  ctx.fillText(input.title, pad, pad + 20);
  ctx.fillStyle = colors.muted;
  ctx.font = font(500, 13);
  ctx.fillText(input.subtitle, pad, pad + 42);

  // Lienzo
  const top = pad + headH;
  ctx.save();
  roundRect(ctx, pad, top, mapW, mapH, 14);
  ctx.clip();
  if (img) ctx.drawImage(img, pad, top, mapW, mapH);
  else {
    ctx.fillStyle = colors.surface2;
    ctx.fillRect(pad, top, mapW, mapH);
  }
  ctx.restore();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  roundRect(ctx, pad + 0.5, top + 0.5, mapW - 1, mapH - 1, 14);
  ctx.stroke();

  // Columna derecha: top 5
  const x = pad + mapW + gap;
  let y = top + 4;
  ctx.fillStyle = colors.text2;
  ctx.font = font(700, 13);
  ctx.fillText("Top 5", x, y + 12);
  y += 26;
  input.top.forEach((t, i) => {
    ctx.font = font(600, 12);
    ctx.fillStyle = colors.muted;
    ctx.fillText(String(i + 1), x, y + 12);
    ctx.fillStyle = t.color;
    roundRect(ctx, x + 16, y + 3, 10, 10, 2);
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.font = font(500, 12.5);
    const lines = wrap(ctx, t.name, side - 120);
    lines.forEach((ln, j) => ctx.fillText(ln, x + 32, y + 12 + j * 15));
    ctx.font = font(700, 12.5);
    ctx.textAlign = "right";
    ctx.fillText(t.value, x + side - 52, y + 12);
    ctx.fillStyle = colors.muted;
    ctx.font = font(500, 11.5);
    ctx.fillText(t.share, x + side, y + 12);
    ctx.textAlign = "left";
    y += Math.max(1, lines.length) * 15 + 10;
  });

  // Leyenda
  y += 14;
  ctx.fillStyle = colors.text2;
  ctx.font = font(700, 12);
  for (const ln of wrap(ctx, input.legendTitle, side)) {
    ctx.fillText(ln, x, y + 12);
    y += 16;
  }
  y += 6;
  const sw = Math.min(52, (side - 8) / (input.classes.length + 1));
  const items = [...input.classes, { color: input.noDataColor, label: "Sin registros" }];
  items.forEach((c, i) => {
    const cx = x + i * (sw + 2);
    ctx.fillStyle = c.color;
    roundRect(ctx, cx, y, sw, 9, 2);
    ctx.fill();
    ctx.fillStyle = colors.muted;
    ctx.font = font(500, 10);
    const lines = wrap(ctx, c.label, sw + 2);
    lines.forEach((ln, j) => ctx.fillText(ln, cx, y + 22 + j * 12));
  });

  if (input.footer) {
    ctx.fillStyle = colors.muted;
    ctx.font = font(500, 11);
    ctx.fillText(input.footer, pad, H - pad + 6);
  }
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
