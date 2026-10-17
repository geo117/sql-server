# Reporte de Auditoría de Seguridad

## 1. Alcance y Metodología
La auditoría se realizó utilizando la metodología estática basada en el skill `security-audit`, revisando los componentes del backend (FastAPI, Python) y del frontend (React, Vite).

## 2. Hallazgos Confirmados
Se identificaron 7 hallazgos (2 Altos, 3 Medios, 1 Bajo, 1 Informativo), detallados en `findings.json`.

- **F-01 (Alta):** Archivo `.env` presente con credenciales en texto plano.
- **F-02 (Alta):** Cifrado ODBC desactivado por defecto (`Encrypt=no`).
- **F-03 (Media):** Canal WebSocket `/ws/monitor` sin protección por API Key.
- **F-04 (Media):** Almacenamiento de API Key en `localStorage`.
- **F-05 (Media):** Configuración de credenciales de base de datos vacías por defecto.
- **F-06 (Baja):** Divulgación de estado de autenticación en `/api/health`.
- **F-07 (Informativo):** Dependencia `apscheduler` no utilizada.

## 3. Recomendaciones Prioritarias
1. **Seguridad de Conexión:** Forzar `Encrypt=yes` y `TrustServerCertificate=no` (o usar certificados válidos) en la cadena ODBC de producción.
2. **Protección WebSocket:** Extender la dependencia de autenticación (`require_api_key` o token de sesión) al endpoint `/ws/monitor`.
3. **Gestión de Secretos:** Remover archivos `.env` del repositorio y asegurar que no almacenen credenciales de producción reales.
