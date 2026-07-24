# Clinical Soft Glass

## Principios

CliniControl usa 80% superficies clínicas sólidas, 15% profundidad visual suave y 5% glass. El objetivo es claridad, confianza y lectura cómoda, no decoración. El cambio es únicamente visual: no modifica rutas, acciones, permisos, datos, RLS ni APIs.

## Tokens y tipografía

Los tokens semánticos viven en `app/globals.css`: fondo gris azulado, superficies blancas, texto oscuro, teal clínico, azul médico, estados, bordes, radios de 8/12/16/20 px y sombras discretas. Inter se mantiene mediante `next/font`; no se descargan fuentes en runtime. El dashboard mantiene texto base de 14 px y contenido clínico de 15-16 px mediante sus componentes existentes.

## Superficies y glass

- `surface-card`: módulos y resúmenes sólidos.
- `clinical-surface`: filas y bloques clínicos sólidos.
- `glass-nav`: topbars, navegación y navegación móvil.
- `glass-toolbar`: filtros y controles secundarios.
- `glass-panel`: hero y paneles destacados no clínicos.

Glass está prohibido en notas, expediente, consentimientos, firmas, pagos, tablas clínicas, alertas, errores, formularios largos y diálogos destructivos. Tiene fallback blanco, `@supports` para blur y opacidad mayor con `prefers-reduced-motion`.

## Componentes

`Button`, `ButtonLink`, `Input`, `Select`, `Textarea`, `Badge`, `PageHeader` y `StatCard` centralizan foco visible, tamaños táctiles, bordes, estados deshabilitados y variantes. Las pantallas nuevas deben reutilizarlos antes de crear una variante local incompatible.

## Responsive, accesibilidad e impresión

La sidebar es persistente sólo desde escritorio; móvil mantiene un drawer modal y navegación inferior de acciones esenciales. Al abrir el drawer, el foco se mueve al cierre, Tab y Shift+Tab permanecen dentro, Escape/backdrop/ruta lo cierran, el body bloquea scroll y el foco vuelve al control de origen. La raíz de la aplicación queda inerte mientras el diálogo está abierto, sin aplicar `aria-hidden` al ancestro del drawer.

La navegación inferior y el contenido del dashboard consideran `safe-area-inset-bottom`. Las tablas existentes conservan scroll horizontal cuando es necesario; no se usa `overflow-x: hidden` global para ocultar errores de layout. Las listas principales ya se adaptan a filas/cards y los hijos de grids/flex deben usar `min-w-0` cuando el contenido pueda desbordar.

La impresión elimina glass, navegación y controles sólo mediante clases semánticas: `app-navigation`, `app-topbar`, `app-mobile-navigation`, `app-sidebar`, `app-version-footer`, `non-printable-action` y `print-hidden`. No se ocultan globalmente `header`, `footer`, `nav`, botones ni roles, por lo que encabezados, pies, firma y contenido clínico interno se conservan. `print-only` permite encabezados imprimibles cuando una ruta ya los necesita.

## Motion y mantenimiento

Las transiciones son cortas y sólo para controles. `prefers-reduced-motion` reduce transiciones y transparencia. Evitar colores repetidos hard-coded donde exista token, glass en información sensible, overlays sin contraste y cambios de layout que oculten acciones. Ejecutar `npm run audit:ui` junto con las validaciones habituales.
