# Detalle de paciente por tenant

La ruta `/dashboard/patients/[id]` valida el UUID y resuelve la clínica activa
en servidor. El paciente se consulta siempre por `id` y por el `clinic_id`
resuelto; citas, pagos, notas y consentimientos añaden además ambos filtros.
Un UUID inexistente o perteneciente a otra clínica produce la misma respuesta
404 para no revelar su existencia.

La vista es sólo de lectura. Las consultas seleccionan únicamente las columnas
mostradas y excluyen `note_data`, `signing_token`, firmas, hashes, IP, user
agent y demás metadatos técnicos. Los nombres de médicos se resuelven, cuando
existen, desde perfiles públicos filtrados por la misma clínica.

El repositorio no tiene un runner de pruebas unitarias. La validación de UUID,
el cálculo de edad y los formatos de fecha, moneda y estados se mantienen como
funciones puras en `lib/patients/detail.ts` para pruebas futuras.
