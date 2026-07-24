# Route regression matrix

| Ruta | Rol/estado | Función preservada | Cambio visual | Prueba | Resultado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Público | Landing y pricing | Hero y navegación glass moderado | Carga + 390/1280 px | Pendiente manual | Sin cambios comerciales |
| `/login`, `/register` | Público | Auth y `next` seguro | Auth shell y formulario sólido | Carga + teclado | Pendiente manual | Sin cambios de action |
| `/onboarding` | Auth | Trial y alta | Auth shell | Formulario responsive | Pendiente manual | Sin cambios de FormData |
| `/dashboard` | Miembro activo | Métricas reales | Shell, topbar y KPI | Sesión demo | Pendiente manual | Aviso demo visible |
| `/dashboard` | Miembro activo, 320/390 px | Drawer y navegación inferior | Diálogo accesible + safe area | Teclado, Escape, Tab/Shift+Tab, backdrop y cambio de ruta | Pendiente manual | Foco/scroll deben restaurarse |
| `/dashboard/patients` | Miembro activo | Filtro y paginación | Toolbar y tabla sólida | Query params | Pendiente manual | Sin cambios de consulta |
| `/dashboard/appointments` | Miembro activo | Agenda y acciones | Toolbar y superficies sólidas | Estados | Pendiente manual | Sin cambios de action |
| `/dashboard/payments` | Miembro activo | Pagos clínicos | Toolbar y tabla sólida | Filtros | Pendiente manual | Sin cambio a SaaS billing |
| `/dashboard/members` | Owner/admin | Miembros e invitaciones | Tablas sólidas | Estados de invitación | Pendiente manual | Sin cambios Resend |
| `/consent/sign/[token]` | Público | Firma | Superficie sólida | Token inválido/firmado | Pendiente manual | Headers intactos |
| `*` | Público | Not found/error | Auth shell sólido | Carga + teclado | Pendiente manual | Sin datos en metadata |

## Rollback

El PR es visual y se revierte por commit. No contiene migraciones, cambios de datos, APIs, RLS, RPCs, PayPal, pagos ni lógica clínica. No revertir los PR funcionales 18-34 para deshacer un problema visual.

## Estado de QA

Pre-staging QA foundation and automated static checks completed; authenticated, cross-browser, device and print execution remains pending.
