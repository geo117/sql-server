# Necesidades de Validación

## V-01: Confirmación de credenciales válidas en .env
- **Hallazgo relacionado:** F-01
- **Bloqueo:** No se puede verificar sin ejecutar el entorno.
- **Plan de validación seguro:** Ejecutar un script de Python que intente conectar a SQL Server usando la configuración del `.env` en un entorno aislado sin red externa.

## V-02: Disponibilidad del driver ODBC
- **Hallazgo relacionado:** F-02
- **Bloqueo:** El driver por defecto (`{ODBC Driver 17 for SQL Server}`) debe estar instalado en el entorno de despliegue.
- **Plan de validación seguro:** Ejecutar `pyodbc.drivers()` en un contenedor sin red para verificar la disponibilidad del driver.