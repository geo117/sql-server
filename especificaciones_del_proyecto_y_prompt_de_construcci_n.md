# Especificaciones Técnicas del Proyecto: Dashboard Monitor de SQL Server

Este documento sirve como guía arquitectónica e instrucciones de desarrollo paso a paso para la construcción del sistema de monitoreo en tiempo real de SQL Server.

---

## 1. Arquitectura General y Tecnologías

El sistema consta de:
1. **Backend:** Servidor API REST / WebSockets en Python utilizando **FastAPI** y `pyodbc` para conectar con SQL Server.
2. **Frontend:** Aplicación Single Page (SPA) en **React.js** estructurada modularmente.

---

## 2. Especificación del Backend (Python / FastAPI)

### 2.1 Ecosistema y Dependencias (`requirements.txt`)
Crea un archivo `requirements.txt` en la raíz de la carpeta `backend/` con las siguientes librerías:

```text
fastapi>=0.100.0
uvicorn[standard]>=0.22.0
pyodbc>=4.0.39
pydantic>=2.0
python-dotenv>=1.0.0
apscheduler>=3.10.1
```

### 2.2 Configuración de Conexión a SQL Server (`database.py`)
Utiliza la cadena de conexión ODBC estándar para SQL Server asegurándote de usar `TRUSTED_CONNECTION=yes` si es autenticación Windows o usuario/contraseña de SQL Server.

```python
import pyodbc
import os
from dotenv import load_dotenv

load_dotenv()

DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "master")
DB_USER = os.getenv("DB_USER", "monitor_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "PasswordSegura123!")
DB_DRIVER = os.getenv("DB_DRIVER", "{ODBC Driver 17 for SQL Server}")

def get_db_connection():
    conn_str = f"DRIVER={DB_DRIVER};SERVER={DB_SERVER};DATABASE={DB_NAME};UID={DB_USER};PWD={DB_PASSWORD};Encrypt=no;"
    conn = pyodbc.connect(conn_str)
    return conn
```

### 2.3 Endpoints y Consultas DMV (`main.py`)

Debes crear los siguientes endpoints REST:

1. **`GET /api/active-processes`**
   * **Propósito:** Retorna todos los procesos activos con consumo alto de CPU, I/O y duración.
   * **Consulta SQL:**
     ```sql
     SELECT 
         r.session_id,
         s.login_name,
         s.host_name,
         s.program_name,
         r.status,
         r.command,
         r.cpu_time,
         r.total_elapsed_time AS elapsed_time_ms,
         r.reads,
         r.writes,
         r.logical_reads,
         r.blocking_session_id,
         SUBSTRING(st.text, (r.statement_start_offset/2) + 1,
             ((CASE r.statement_end_offset
                 WHEN -1 THEN DATALENGTH(st.text)
                 ELSE r.statement_end_offset
              END - r.statement_start_offset)/2) + 1) AS statement_text,
         qp.query_plan
     FROM sys.dm_exec_requests r
     INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
     CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
     OUTER APPLY sys.dm_exec_query_plan(r.plan_handle) qp
     WHERE s.is_user_process = 1
       AND r.session_id <> @@SPID
     ORDER BY r.cpu_time DESC;
     ```

2. **`GET /api/blocked-processes`**
   * **Propósito:** Captura sesiones bloqueadas y el script del proceso bloqueador.
   * **Consulta SQL:**
     ```sql
     SELECT 
         DB_NAME(r.database_id) AS DBName,
         r.session_id AS WaitingSpid,
         r.blocking_session_id AS BlockingSpid,
         r.wait_type,
         r.wait_time AS WaitTime_ms,
         s_block.login_name AS BlockingUser,
         s_block.host_name AS BlockingHost,
         s_block.program_name AS BlockingProgram,
         s_block.status AS BlockingSessionStatus,
         COALESCE(st_block_req.text, st_block_conn.text, 'No T-SQL text available') AS BlockingQuery
     FROM sys.dm_exec_requests r
     INNER JOIN sys.dm_exec_sessions s_block 
         ON r.blocking_session_id = s_block.session_id
     LEFT JOIN sys.dm_exec_requests r_block 
         ON s_block.session_id = r_block.session_id
     LEFT JOIN sys.dm_exec_connections c_block 
         ON s_block.session_id = c_block.session_id
     OUTER APPLY sys.dm_exec_sql_text(r_block.sql_handle) st_block_req
     OUTER APPLY sys.dm_exec_sql_text(c_block.most_recent_sql_handle) st_block_conn
     WHERE r.blocking_session_id <> 0;
     ```

3. **`POST /api/kill-process/{spid}`**
   * **Propósito:** Termina un proceso conflictivo por su SPID previa confirmación.
   * **Ejecución SQL:** `KILL {spid}` (Manejar excepciones e impedir matar conexiones críticas del sistema).

4. **`GET /api/server-stats`**
   * **Propósito:** Retorna resumen de uso de CPU, número de conexiones activas y total de bloqueos.

---

## 3. Especificación del Frontend (React.js)

### 3.1 Librerías Requeridas
Asegúrate de tener instaladas las librerías indicadas:
```bash
npm install react-bootstrap bootstrap react-icons react-router-dom sweetalert2
```

### 3.2 Estilo Visual y Paleta de Colores
* **Tema Principal:** Dark Mode Empresarial (Corporate Tech).
* **Fondo Principal:** `#0F172A` (Slate Dark)
* **Paneles / Cards:** `#1E293B` (Slate Medium)
* **Texto Principal:** `#F8FAFC`
* **Color Primario (Acción):** `#2563EB` (Azul Empresarial)
* **Alertas / Bloqueos Críticos:** `#EF4444` (Rojo Intenso)
* **Advertencias / Tiempos de Espera:** `#F59E0B` (Ámbar)
* **Exitoso / Normal:** `#10B981` (Verde Esmeralda)

### 3.3 Estructura de Directorios Sugerida
```text
src/
├── assets/
│   └── styles/
│       └── custom.css
├── components/
│   ├── common/
│   │   ├── Navbar.jsx
│   │   ├── Sidebar.jsx
│   │   └── StatCard.jsx
│   ├── dashboard/
│   │   ├── ActiveProcessesTable.jsx
│   │   ├── BlockedProcessesTable.jsx
│   │   └── ProcessDetailModal.jsx
│   └── layout/
│       └── DashboardLayout.jsx
├── services/
│   └── api.js
├── pages/
│   ├── DashboardPage.jsx
│   ├── BlockedPage.jsx
│   └── SettingsPage.jsx
├── App.jsx
└── index.js
```

### 3.4 Requerimientos de Componentes Frontend

1. **`Navbar.jsx`:** Contendrá el estado de conexión del backend (Indicador Online/Offline), selector de auto-refresco (3s, 5s, 10s, Pausa) y botón de refresco manual.
2. **`StatCard.jsx`:** Tarjetas en la parte superior del Dashboard que muestran:
   * Total de Sesiones Activas.
   * Procesos Bloqueados en el momento (si es $>0$, aplicar animación de pulso rojo).
   * Uso Promedio de CPU / I/O.
3. **`ActiveProcessesTable.jsx`:** Tabla interactiva construida con `react-bootstrap`:
   * Columnas: `SPID`, `Usuario`, `Host`, `Programa`, `Estado`, `CPU (ms)`, `Lecturas Lógicas`, `Tiempo Transcurrido`, `Acciones`.
   * Filas destacadas en amarillo si el tiempo supera 5000 ms.
   * Botón con icono `FaCode` para ver el script SQL completo en un modal.
   * Botón con icono `FaSkull` o `FaTimesCircle` que dispara una alerta con **SweetAlert2** pidiendo confirmación para matar la sesión (`KILL SPID`).
4. **`BlockedProcessesTable.jsx`:** Vista enfocada en relaciones de bloqueo con alerta visual clara: `[Proceso Bloqueador (SPID X)] ➔ [Proceso Bloqueado (SPID Y)]`.
5. **Uso de SweetAlert2:**
   * Al hacer clic en terminar un proceso, invocar `Swal.fire()` con confirmación de dos pasos para prevenir la terminación accidental de procesos legítimos.

---
