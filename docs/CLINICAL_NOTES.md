# Notas clinicas

Las notas usan las tablas existentes `medical_notes` y `medical_note_templates`.
No se agregan columnas, enums ni migraciones.

## Creacion y plantillas

Una nota nueva siempre se crea como `draft`, con el usuario autenticado como
`doctor_id`. La aplicacion valida que el paciente, plantilla opcional y cita
opcional pertenezcan a la clinica activa; una cita tambien debe pertenecer al mismo
paciente. Los IDs se validan antes de cualquier consulta.

Las plantillas se seleccionan por clinica e `is_active = true`. Su JSONB se lee de
forma defensiva para generar texto inicial a partir de los nombres de secciones y
campos conocidos. La interfaz no renderiza JSON crudo ni HTML de la plantilla.
El esquema actual requiere `clinic_id`, por lo que no hay plantillas globales en
esta implementacion.

El contenido editable se guarda como `note_data.content` de texto plano. Si una
nota previa usa otro formato, se preserva su objeto JSONB y se muestra una lectura
segura de `content` o `summary`; no se interpreta como HTML.

## Edicion y concurrencia

Solo los borradores pueden editarse. Un `doctor` solo puede editar sus propios
borradores; `owner` y `admin` pueden editar los borradores de la clinica. Las
notas finalizadas y archivadas son de solo lectura en la aplicacion.

La actualizacion compara `updated_at` recibido como campo oculto con el valor en
base de datos. Si no coincide, no se sobrescribe el registro y la persona recibe
un aviso para recargar. La accion nunca actualiza `clinic_id`, `patient_id`,
`doctor_id`, plantilla, cita ni estado.

## Datos expuestos

El detalle muestra especialidad, impresion clinica, contenido de texto, estado,
autor, plantilla, cita vinculada y marcas de tiempo. No se usan datos mock como
fallback y no se registran cuerpos de notas en logs de aplicacion.
