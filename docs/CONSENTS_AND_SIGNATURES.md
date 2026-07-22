# Consentimientos y firmas

Los consentimientos se implementan con `consents` y las firmas existentes con
`consent_signatures`. Todas las lecturas se limitan a paciente y clinica activa;
la politica RLS de firmas verifica adicionalmente el consentimiento relacionado.

## Creacion

Los roles `owner`, `admin` y `doctor` pueden crear un consentimiento para un
paciente de su clinica. Se validan tipo, version y texto en el servidor. El nuevo
registro inicia en `pending`, guarda el creador autenticado y genera el
`signing_token` con `crypto.randomUUID()` exclusivamente en el servidor.

El token no se devuelve a la interfaz, no se agrega a URLs, no se escribe en logs
y no se usa para activar un flujo publico en este cambio.

## Visualizacion de firmas

El detalle puede mostrar firmas existentes con nombre de firmante y fecha. No lee
ni expone `signature_data`, metadata de IP, user agent o hash de documento.

La captura de firmas queda intencionalmente deshabilitada. Aunque el esquema tiene
una tabla de firmas, no hay en este alcance un flujo publico autenticado y
verificado que permita atribuir una firma de manera segura. No se debe fabricar
identidades ni reutilizar el flujo mock publico de consentimientos para datos
reales.

Los consentimientos no tienen una relacion de cita en el esquema actual, por lo
que la interfaz no inventa ese enlace. Tampoco se implementan revocacion,
expiracion ni cambios de estado en este PR.
