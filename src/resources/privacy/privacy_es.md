# Política de Privacidad
*Última Actualización: 27 de junio de 2026*

Esta Política de Privacidad detalla las prácticas de privacidad para la aplicación de escritorio local Codeoba (la "Aplicación") y el sitio web codeoba.com (el "Sitio"). Tanto la Aplicación como el Sitio son desarrollados, publicados y operados por What AI Can Do, LLC (la "Compañía").

Por favor lea esta política detenidamente. Si no está de acuerdo con los términos aquí descritos, por favor no utilice la Aplicación ni el Sitio.

---

## 1. Principio Fundamental: Local-Primero por Defecto
> Codeoba está diseñado para ser una aplicación local-primero. Todos los transcritos de diálogos, índices de bases de datos y cachés se almacenan completamente en su máquina local.

Los aspectos clave de esta implementación local-privada incluyen:
- **Cero Registros Remotos:** Los transcritos de conversaciones agregados de directorios de asistentes locales (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot, etc.) se procesan sin conexión y se analizan directamente dentro de la ejecución del cliente de escritorio en su dispositivo.
- **Base de Datos SQLite y Caché Local:** Todos los turnos indexados, registros, palabras clave de búsqueda y datos de rendimiento se persisten en un directorio de caché local.
- **Caché local preanalizada:** Todas las conversaciones indexadas se analizan localmente en una caché de sesión rápida en el directorio personal del usuario para permitir el inicio inmediato de la aplicación sin llamadas a redes externas.

## 2. Diagnósticos y Verificaciones de Actualización Automática
Para mantener la plataforma operativa y segura, Codeoba realiza actualizaciones de diagnóstico básicas:
- **Verificaciones de Actualización Automática de Software:** Si da su consentimiento explícito, la aplicación consulta nuestro servidor de actualizaciones para verificar las últimas versiones. Se envían parámetros de red estándar (como la versión de la aplicación y la preferencia de idioma, junto con la versión del sistema operativo y la arquitectura de la CPU de su sistema) para recuperar el manifiesto de la versión, pero no se recopilan datos personales ni de conversaciones.
- **Registro de Telemetría y Diagnóstico:** Para monitorear la salud del servicio y prevenir el abuso del límite de velocidad de la API, las solicitudes de actualización se registran en GCP Cloud Logging, que conoce intrínsecamente la dirección IP del cliente desde la cual provienen las solicitudes. Estos registros capturan detalles del sistema operativo y el GUID de instalación anónimo. Todos estos registros se retienen durante 30 días y luego se eliminan de forma permanente automáticamente.

## 3. Analíticas del Sitio Web y Consentimiento de Cookies
Para analizar el tráfico de visitantes y monitorear las tasas de descarga, el Sitio utiliza Google Analytics (GA4). Por defecto, el seguimiento analítico está completamente desactivado y no se cargan cookies.

Cuando visita el Sitio, se presenta un banner de consentimiento de privacidad:
- **Consentimiento Aceptado:** Si acepta el seguimiento, cargamos Google Analytics dinámicamente. Google Analytics colocará identificadores persistentes (cookies como _ga y _ga_<id-del-contenedor>) para rastrear visitas anónimas a la página y clics de descarga. Su dirección IP está anonimizada.
- **Consentimiento Rechazado:** Si lo rechaza, el script de Google Analytics nunca se carga. No se almacenan cookies y no se envían pings de huella digital del dispositivo.

Puede retirar o restablecer su elección en cualquier momento: [Gestionar Preferencias de Privacidad](#) (esto borra su elección guardada y muestra el banner de consentimiento de nuevo inmediatamente).

## 4. Compartir su Información
No vendemos, alquilamos ni comercializamos sus datos personales. Compartimos únicamente la información técnica limitada necesaria para operar nuestro servicio de actualización y diagnóstico con el proveedor de servicios externo de confianza (subprocesador) que se detalla a continuación:
- **Infraestructura en la Nube:** Utilizamos Google Cloud Platform (GCP) Cloud Logging para almacenar registros de telemetría estándar (como direcciones IP e información del dispositivo para comprobaciones de actualizaciones) con fines de diagnóstico y seguridad. Estos registros se eliminan automáticamente después de 30 días.

## 5. Seguridad de sus Datos Locales
Dado que sus datos se almacenan localmente, la seguridad de sus transcripciones indexadas depende de la seguridad de su propio dispositivo. Recomendamos proteger su máquina con herramientas de cifrado estándar (como FileVault en macOS) y contraseñas seguras.

## 6. Cambios a esta Política de Privacidad
La Compañía se reserva el derecho de modificar esta Política de Privacidad. Cualquier modificación se actualizará en esta página con una fecha de "Última Actualización" revisada. Se recomienda consultar esta página periódicamente.

## 7. Contacto
Si tiene alguna pregunta o desea hablar sobre estas prácticas de privacidad, comuníquese con la Compañía:
- **Correo electrónico:** privacy@whataicando.com
- **Organización:** What AI Can Do, LLC
- **Web:** [whataicando.com](https://whataicando.com)
