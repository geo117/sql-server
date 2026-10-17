# Detalle de Hallazgos

## F-01: Existencia de archivo .env con credenciales en texto plano
- **Severidad:** Alta
- **Archivo:** `backend/.env`
- **Descripción:** El archivo `.env` contiene credenciales de base de datos (ej: `DB_USER`, `DB_PASSWORD`) sin cifrar.
- **Impacto:** Si el archivo es expuesto, se comprometen las credenciales de la base de datos.
- **Recomendación:** Asegurar permisos 600 y verificar `.gitignore` excluye `.env`.

## F-02: Cifrado de conexión ODBC desactivado por defecto (Encrypt=no)
- **Severidad:** Alta
- **Archivo:** `backend/database.py` (líneas 40-41)
- **Descripción:** `DB_ENCRYPT` por defecto es `"no"` y `DB_TRUST_SERVER_CERTIFICATE` es `"yes"`.
- **Impacto:** Las credenciales y consultas viajan en texto plano por la red.
- **Recomendación:** Forzar `Encrypt=yes` y `TrustServerCertificate=no` en entornos de producción.

## F-03: Canal WebSocket `/ws/monitor` sin autenticación por API Key
- **Severidad:** Media
- **Archivo:** `backend/main.py` (líneas 356-384)
- **Descripción:** El endpoint WebSocket no incluye la dependencia `require_api_key` ni validación de cabeceras.
- **Impacto:** Cualquier cliente puede acceder a datos en tiempo real sin autenticarse, incluso cuando `API_KEY` está configurada.
- **Recomendación:** Agregar autenticación en la conexión WebSocket.

## F-04: Almacenamiento de API Key en localStorage del navegador
- **Severidad:** Media
- **Archivo:** `frontend/src/services/settings.js` (líneas 68-79)
- **Descripción:** La API Key se guarda en `window.localStorage` en texto plano.
- **Impacto:** Un XSS permitiría robar la API Key y acceder al backend.
- **Recomendación:** Usar cookies HttpOnly seguras o advertir sobre riesgos de XSS.

## F-05: Configuración de credenciales de base de datos vacías en entorno por defecto
- **Severidad:** Media
- **Archivo:** `backend/database.py` (líneas 36-37)
- **Descripción:** Si `DB_TRUSTED_CONNECTION` es falso pero `DB_USER` o `DB_PASSWORD` están vacíos, la conexión falla.
- **Impacto:** Fallo de servicio si la configuración no está completa.
- **Recomendación:** Validar en la inicialización que las credenciales estén completas cuando no se usa Trusted Connection.

## F-06: Divulgación de estado de autenticación en endpoint `/api/health`
- **Severidad:** Baja
- **Archivo:** `backend/main.py` (línea 227)
- **Descripción:** El endpoint `/api/health` devuelve `auth_required` sin requerir autenticación.
- **Impacto:** Permite fingerprinting del estado de autenticación.
- **Recomendación:** Limitar la información pública si no es estrictamente necesaria.

## F-07: Dependencia `apscheduler` no utilizada en código activo
- **Severidad:** Informativo
- **Archivo:** `backend/requirements.txt`
- **Descripción:** `apscheduler` está listado pero no se referencia en el código.
- **Impacto:** Superficie de ataque innecesaria por dependencias no usadas.
- **Recomendación:** Eliminar `apscheduler` de `requirements.txt` si no se utiliza.