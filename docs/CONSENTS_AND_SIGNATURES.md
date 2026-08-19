# Consentimientos y firmas

La implementación vigente corresponde a la fase 1 de Consentimiento Digital v1.
El diseño completo y sus fases están documentados en
`docs/CONSENT_DIGITAL_V1.md`.

## Integridad y creación

Cada consentimiento pertenece a una clínica, un paciente y el expediente
universal activo de ese mismo paciente. La relación se protege con claves
foráneas compuestas; no depende solamente de filtros de la interfaz.

Los roles `owner`, `admin` y `doctor` crean consentimientos mediante
`create_consent_for_current_user`. La función vuelve a validar membresía,
entitlement, paciente y expediente, deriva `clinical_record_id`, inserta el
consentimiento pendiente y registra `consent_created` en `audit_logs` dentro de
la misma transacción. `assistant` no obtiene acceso clínico.

## Ciclo de vida fase 1

Los nuevos documentos usan únicamente `pending`, `signed` y `cancelled`.
`expired` permanece como valor legacy del enum para compatibilidad, pero un
enlace vencido ya no cambia el estado legal del consentimiento.

Solo un documento `pending` puede cancelarse. La cancelación conserva la fila,
revoca el enlace actual, guarda actor, fecha y motivo normalizado opcional, y
registra `consent_cancelled`. Una cancelación repetida es idempotente.

Un consentimiento firmado no puede volver a pendiente ni cancelarse. Su
clínica, paciente, expediente, tipo, versión, texto, plantilla y datos de firma
son inmutables. `consent_signatures` admite como máximo una firma por
consentimiento y sus filas no pueden actualizarse ni eliminarse.

## Acceso y datos legacy

Los clientes autenticados conservan lectura RLS únicamente de columnas
necesarias. No pueden leer directamente `signing_token`, `signing_token_hash` o
`signature_data`, ni escribir `consents` o `consent_signatures`. Las mutaciones
se realizan mediante RPCs específicas con `search_path` fijo.

La columna plaintext `signing_token` se conserva temporalmente para no destruir
datos históricos, pero ningún código nuevo la usa. Se retirará en 0024 junto con
la sustitución del modelo transitorio de tokens.
