# Balú — Design Tokens

Tokens del Sistema de Diseño Balú, extraídos de Figma.

## Archivos

| Archivo | Rol |
|---|---|
| `tokens.json` | Fuente de verdad en formato [DTCG](https://design-tokens.github.io/community-group/format/). Compatible con Style Dictionary. **No consumir directo en CSS.** |
| `tokens.css` | Custom properties listas para usar. **Este es el archivo que importa el dev.** |

## Uso rápido (dev)

```html
<link rel="stylesheet" href="tokens.css">
```

o en tu CSS/SCSS:

```css
@import './tokens.css';
```

Luego consume las variables:

```css
.card {
  background: var(--balu-color-white);
  border-radius: var(--balu-radius-card);
  box-shadow: var(--balu-shadow-md);
  padding: var(--balu-spacing-3); /* 24px */
}

.btn-primary {
  background: var(--balu-color-primary);
  border-radius: var(--balu-radius-button);
  font: var(--balu-weight-semibold) var(--balu-button-m-size)/var(--balu-button-m-line) var(--balu-font-button);
}
```

También hay clases utilitarias tipográficas opcionales: `.balu-h1`…`.balu-h5`, `.balu-s1`…`.balu-s4`, `.balu-body-18`…`.balu-body-10`, `.balu-button-l/m/s`, con modificadores `.balu-italic`, `.balu-semibold`, `.balu-bold`.

## Fuentes requeridas

Cargar desde Google Fonts (o self-host):

```html
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,400&family=Poppins:wght@500;600&family=Red+Hat+Display:wght@700&display=swap" rel="stylesheet">
```

## Capa semántica

La capa semántica nace de **Acciones y estados**: `success`, `error`, `warning` e `info`, cada uno con escala `50–900` (`--balu-success-500`, `--balu-error-700`...). Los pasos ancla vienen de Figma (Verde=success-500, Verde oscuro=success-800, Rojo oscuro=error-700, Amarillo oscuro=warning-800, Azul=info-600); el resto son generados. El alias corto (`--balu-success`) apunta al ancla.

## Convenciones

- Prefijo: `--balu-*`
- Spacing: escala base 8px (`--balu-spacing-1` = 8px … `--balu-spacing-12` = 96px)
- Radius: escala base 8px (`--balu-radius-1/2/3/full` = 8/16/24/96px) con alias por uso (`alert`, `table`, `textarea`, `popup`, `card`, `button`)
- Sombras: escala `xs / sm / md / lg / xl`
- `tokens.css` se regenera desde `tokens.json` — nunca editarlo a mano

## Pendiente

- Ninguno — paleta de colores completa extraída de los estilos del proyecto Figma.
