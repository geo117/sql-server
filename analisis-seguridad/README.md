# Análisis de Seguridad — SQL Server Monitor

**Fecha:** 2026-10-17
**Repositorio:** `D:\DELL\Documents\codigo_practica\opencode\sql-server`
**Alcance:** Backend (Python/FastAPI) + Frontend (React/Vite)
**Método:** Revisión estática de fuente, evaluación de controles de seguridad, identificación de fronteras de confianza y vulnerabilidades.

---

## Índice

1. [Resumen ejecutivo](#resumen-ejecutivo)
2. [Arquitectura y fronteras de confianza](#arquitectura-y-fronteras-de-confianza)
3. [Hallazgos confirmados](#hallazgos-confirmados)
4. [Hallazgos pendientes de validación](#hallazgos-pendientes-de-validacion)
5. [Observaciones y recomendaciones de hardening](#observaciones-y-recomendaciones-de-hardening)
6. [Archivos analizados](#archivos-analizados)

---

## Resumen ejecutivo

La aplicación es un dashboard de monitoreo de SQL Server con un backend FastAPI (solo lectura DMV + endpoint destructivo `KILL` fuertemente validado) y una interfaz React.

**Puntos fuertes detectados:**
- Autenticación por API key con comparación de tiempo constante (`hmac.compare_digest`).
- Validación estricta de SPID en `KILL` (dígito, rango, verificación de `is_user_process`).
- Rate limit en la acción destructiva por IP real.
- Errores de BD no filtran detalles al cliente (`_handle_db_error`).
- CORS restringido por lista blanca.
- Frontend sanitiza URLs base (`sanitizeBaseUrl`) y escapa HTML en alerts.
- T-SQL se muestra como texto plano (no se ejecuta), lo que es correcto.

**Hallazgos principales (confirmados):**
- **F-01 (Alta):** Credenciales de BD por variable de entorno en texto plano; `.env` existe en el árbol y no está en `.gitignore` del backend.
- **F-02 (Alta):** Conexión ODBC con `Encrypt=no` por defecto y `TrustServerCertificate=yes`; credenciales viajan sin cifrar.
- **F-03 (Media):** WebSocket `/ws/monitor` no está protegido por la dependencia `require_api_key`; expone datos de BD sin autenticación.
- **F-04 (Media):** API key y credenciales se almacenan en `localStorage` en el frontend (accesibles por XSS).
- **F-05 (Media):** La variable `DB_PASSWORD` puede quedar vacía y el driver por defecto es `{ODBC Driver 17 for SQL Server}` (dependencia de driver instalado).
- **F-06 (Baja):** El endpoint `/api/health` revela `auth_required` y es accesible sin API key, permitiendo fingerprinting.
- **F-07 (Baja/Info):** `apscheduler` en `requirements.txt` no se usa en el código visible; posibilidad de dependencia innecesaria o futura.

**Pendientes de validación:**
- **V-01:** Confirmar si `.env` real contiene credenciales válidas (no se puede sin ejecutar).
- **V-02:** Verificar si el driver ODBC está disponible en el entorno de despliegue.

---

## Arquitectura y fronteras de confianza

```
[Navegador] → HTTP/HTTPS → [FastAPI:8000] → ODBC → [SQL Server]
                ↑                        ↑
           API Key (X-API-Key)     DB_USER / DB_PASSWORD
```

### Fronteras:

| Frontera | Entrada | Control | Estado |
|----------|---------|---------|--------|
| HTTP → API | Cabeceras, path params | API Key (opcional), CORS, rate limit | Parcial |
| API → BD | Consultas DMV + KILL | Parámetros validados, permisos de BD | Bueno |
| Frontend → Backend | URLs configurables | `sanitizeBaseUrl` | Bueno |
| WebSocket | Conexión persistente | **Sin autenticación** | **Débil** |
| Almacenamiento frontend | `localStorage` | Ninguno | **Débil** |