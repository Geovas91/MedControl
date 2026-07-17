# Agenda por tenant

La agenda resuelve la clínica activa exclusivamente en servidor. Todas las
consultas usan el cliente SSR normal, RLS y el `clinic_id` resuelto; las
relaciones con pacientes añaden el mismo límite de clínica.

`date=YYYY-MM-DD` representa una fecha local de `clinics.timezone`. El servidor
convierte esa fecha al intervalo UTC semiabierto desde el inicio local hasta el
inicio del día siguiente, por lo que los días de 23 o 25 horas se consultan
correctamente. Las fechas inválidas se normalizan al día local actual.

Los filtros `status`, `doctor` y `q` se validan en servidor y se conservan al
navegar entre días. Los totales representan todas las citas del día antes de
aplicar filtros; el listado sí refleja los filtros. Estado y médico se filtran
en Supabase. La búsqueda por título o paciente se aplica en servidor sobre el
conjunto ya restringido al día y al tenant, evitando consultas fuera del rango.

La vista es sólo de lectura. No enlaza a un detalle de cita ni incorpora
creación, edición, cancelación o eliminación. El repositorio no tiene runner de
pruebas unitarias; validación de fechas, URLs, totales, duración y formato
horario quedan separadas como funciones puras para pruebas futuras.
