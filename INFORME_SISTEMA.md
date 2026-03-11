# Sistema de Gestión de Insumos TAP — Informe de Funcionalidades

**Fecha:** 5 de marzo de 2026
**Tecnologías:** Next.js · Supabase (PostgreSQL) · Tailwind CSS

---

## 1. Descripción General

El **Sistema de Gestión de Insumos TAP** es una aplicación web que digitaliza y trazabiliza el
ciclo completo de administración de insumos de seguridad y equipos de protección personal (EPP).
Gestiona desde la solicitud de un insumo hasta su entrega física y confirmación, incluyendo la
solicitud de compra a proveedores, control de stock en tiempo real y reportería global.

---

## 2. Actores del Sistema

El sistema cuenta con cinco roles con un modelo de capacidades acumulativo:

| Rol            | Descripción                                          |
| -------------- | ---------------------------------------------------- |
| Trabajador     | Personal operativo que recibe insumos                |
| Jefatura       | Supervisor que solicita insumos para su equipo       |
| TENS           | Técnico que gestiona el inventario físico y despacha |
| Prevencionista | Gestor con capacidades de Jefatura + TENS            |
| Administrador  | Control total del sistema y usuarios                 |

Jerarquía de capacidades (acumulativa):

    trabajador → jefatura → tens → prevencionista → administrador

---

## 3. Funcionalidades por Actor

---

### 3.1 Trabajador

El trabajador es un actor pasivo en la solicitud pero activo en la recepción. No puede crear
solicitudes propias; es jefatura o prevencionista quien las genera a su nombre.

**UC-T1 · Ver Inicio (Dashboard)**
El trabajador accede a su panel con tres tarjetas de resumen: insumos por confirmar, insumos
recibidos históricamente y solicitudes en curso. Si hay entregas pendientes, aparece un banner de
alerta pulsable que dirige directamente a la sección de recepciones. El panel se actualiza en
tiempo real mediante suscripción a cambios en la base de datos.

**UC-T2 · Confirmar Recepción de Insumos**
Cuando la jefatura o el prevencionista despacha un insumo, aparece una tarjeta de confirmación en
la bandeja del trabajador. El trabajador verifica físicamente el insumo y hace clic en "Confirmar
Recepción". El sistema llama a la función RPC confirmar_recepcion, que actualiza el estado de la
solicitud a "recibida", registra la fecha/hora de recepción y descuenta el stock correspondiente.

**UC-T3 · Ver Mis Solicitudes**
El trabajador puede revisar el historial completo de todas las solicitudes que han sido creadas a
su nombre, con progreso visual en cuatro etapas: pendiente → autorizada → despachada → recibida.
Puede filtrar por estado y ver quién gestionó cada solicitud con sus observaciones.

---

### 3.2 Jefatura

La jefatura actúa como solicitante de insumos para los trabajadores de su área, además de tener
acceso a las mismas vistas de recepción que cualquier trabajador.

**UC-J1 · Ver Inicio (Dashboard)**
Panel con contadores en tiempo real de solicitudes pendientes, autorizadas, despachadas y recibidas
que él ha creado. Accesos rápidos a las secciones principales.

**UC-J2 · Crear Solicitud de Insumos**
La jefatura busca a un funcionario por RUT o nombre (búsqueda con autocompletar desplegable).
Seleccionado el destinatario, agrega uno o más insumos desde el catálogo activo (solo insumos con
stock disponible) con su cantidad. Puede agregar un motivo general al pedido. Al enviar, el sistema
crea un pedido agrupador con número correlativo (Pedido #001, #002…) y genera una solicitud
individual por cada ítem. Si el pedido incluye al propio solicitante como destinatario, también
queda registrado.

**UC-J3 · Ver Mis Solicitudes (como receptor)**
La jefatura puede ver las solicitudes donde ella es la destinataria (trabajador_id), con el
progreso visual completo y filtros por estado.

**UC-J4 · Confirmar Recepciones**
Puede confirmar la recepción de insumos despachados a su nombre, con el mismo flujo que el
trabajador.

---

### 3.3 TENS (Técnico en Enfermería o Seguridad)

El TENS es el gestor físico del inventario. Recibe, despacha, registra ingresos, controla mermas y
tramita solicitudes de compra.

**UC-N1 · Ver Inicio (Dashboard)**
Panel con resumen de: total de insumos activos, ítems bajo stock crítico, solicitudes pendientes de
revisión, solicitudes listas para despachar, sus despachos realizados y estado de sus solicitudes
de compra.

**UC-N2 · Gestión de Inventario**
Accede a la tabla completa de insumos activos con stock actual, stock mínimo e indicador visual de
alerta. Desde aquí puede:

- Registrar Ingreso de Stock: aumenta la cantidad de un insumo y registra el movimiento en
  movimientos_stock con tipo "ingreso".
- Registrar Merma: descuenta unidades dañadas o vencidas, registra el movimiento con tipo "merma"
  y una justificación obligatoria. El formulario se cierra automáticamente 1,8 segundos después
  de confirmar el registro.

**UC-N3 · Gestionar Solicitudes de Trabajadores**
Vista de todas las solicitudes del sistema clasificadas por estado. El TENS puede:

- Autorizar una solicitud pendiente → pasa a "autorizada".
- Despachar una solicitud autorizada → pasa a "despachada", descuenta stock del inventario,
  genera un registro en la tabla entregas y crea un movimiento de tipo "despacho".
- Rechazar cualquier solicitud activa con observaciones.

**UC-N4 · Consultar Stock**
Vista de solo lectura para buscar insumos por nombre o código y revisar sus niveles actuales sin
poder modificarlos.

**UC-N5 · Solicitar Compra a Proveedor**
Cuando el stock es insuficiente, el TENS genera una Solicitud de Compra con formato de orden de
compra. Incluye: nivel de urgencia (Normal / Urgente / Crítico), proveedor sugerido, justificación
y una tabla de ítems a comprar con nombre, código, cantidad, unidad de medida y precio estimado.
El sistema asigna un número correlativo visible (SC-0001, SC-0002…).

**UC-N6 · Recepción de Compras**
Una vez que el administrador aprueba una solicitud de compra, el TENS la recepciona físicamente:
confirma las cantidades recibidas por ítem, lo que actualiza el stock del insumo en el inventario
y genera un movimiento de tipo "ingreso" con la observación "Recepción SC-XXXX".

**UC-N7 · Mis Recepciones / Mis Solicitudes**
Puede ver y confirmar insumos despachados a su nombre, y revisar las solicitudes asignadas a él
como destinatario.

---

### 3.4 Prevencionista

El Prevencionista tiene las capacidades completas de Jefatura y TENS, siendo el rol más completo
después del Administrador.

Hereda todos los casos de uso del TENS (UC-N1 a UC-N7) y de la Jefatura (UC-J1 a UC-J4),
accesibles desde un único panel con sidebar organizado por secciones:

- Gestión de Insumos: Inventario, stock, solicitud de compra, recepción de compras.
- Solicitudes de Trabajadores: Revisión y gestión de todas las solicitudes pendientes.
- Mis Solicitudes de Insumos: Para solicitar insumos para sí mismo o para trabajadores, ver las
  recibidas y confirmar las despachadas.

---

### 3.5 Administrador

El Administrador tiene acceso completo al sistema con capacidades exclusivas de gestión de
usuarios y reportería global.

**UC-A1 · Panel General**
Dashboard con estadísticas globales: total de usuarios activos por rol, total de solicitudes,
solicitudes activas (pendientes + en proceso) e insumos bajo stock. Vista de desglose por roles.

**UC-A2 · Gestión de Usuarios**
CRUD completo de cuentas de usuario:

- Crear usuarios con RUT, nombre, email, rol, servicio y contraseña temporal.
- Editar datos, rol y estado activo/inactivo.
- Eliminar usuarios del sistema.
- Búsqueda y filtrado por rol.
- El registro en auth.users de Supabase se vincula automáticamente a la tabla usuarios.

**UC-A3 · Gestión de Insumos (Catálogo)**
CRUD del catálogo de insumos:

- Crear nuevos insumos con nombre, descripción, código, unidad de medida, stock actual y stock
  mínimo.
- Editar insumos existentes.
- Desactivar insumos (soft delete — no se eliminan de la BD por integridad referencial).

**UC-A4 · Gestión de Solicitudes de Compra**
Revisa todas las solicitudes de compra emitidas por TENS y Prevencionista. Puede:

- Aprobar una solicitud de compra → queda disponible para recepción.
- Rechazar con observaciones.
- Ver el detalle completo de cada solicitud con el desglose de ítems y precio estimado.

**UC-A5 · Reportes Globales**
Generación de reportes por período (rango de fechas con selector visual):

| Reporte                | Qué muestra                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| Reporte de Entradas    | Todos los ingresos de stock en el período, con nombre del insumo, cantidad,    |
|                        | usuario responsable y origen (Recepción de Compra o Ingreso Manual)            |
| Reporte de Salidas     | Todas las salidas (despachos, mermas, ajustes) con insumo, tipo de movimiento, |
|                        | cantidad, usuario y referencia                                                 |
| Reporte de Entregas    | Solicitudes completadas (entregadas) filtradas por insumo, con datos del       |
| por Insumo             | trabajador receptor                                                            |
| Reporte por Trabajador | Historial de insumos recibidos por cada trabajador en el período               |

Cada reporte puede exportarse en formato CSV.

**UC-A6 · Inventario y Stock**
Vista de solo lectura del inventario completo con tabla de insumos activos y su stock actual.
Consulta de stock individual con buscador por nombre o código.

**UC-A7 · Mis Recepciones / Mis Solicitudes**
Como cualquier otro usuario, el administrador puede ser destinatario de insumos y ver/confirmar
las solicitudes asignadas a él.

---

## 4. Flujo Principal del Sistema

### Flujo de Solicitud de Insumos

    Jefatura / Prevencionista
            │
            ▼
    Crear Solicitud de Insumo
    (seleccionar trabajador + uno o más insumos)
            │
            ▼
    [Estado: PENDIENTE]  ← visible para TENS/Prevencionista
            │
            ▼  Revisión y autorización por TENS / Prevencionista
    [Estado: AUTORIZADA]
            │
            ▼  Despacho físico por TENS / Prevencionista
    [Estado: DESPACHADA]  ← stock descontado automáticamente
            │
            ▼  Confirmación física por el Trabajador/Destinatario
    [Estado: RECIBIDA]  ← fecha y hora registradas

    En cualquier punto activo el TENS puede:
            ▼
    [Estado: RECHAZADA]  ← con observaciones obligatorias

### Flujo de Reposición de Stock (Solicitud de Compra)

    TENS / Prevencionista
            │
            ▼
    Crear Solicitud de Compra (SC-XXXX)
    (urgencia + proveedor + tabla de ítems con cantidades y precios)
            │
            ▼  Revisión por Administrador
    [Compra: APROBADA]
            │
            ▼  Recepción física confirmada por TENS
    Stock actualizado + Movimiento "ingreso" registrado con referencia SC-XXXX

---

## 5. Auditoría y Trazabilidad

Cada acción sobre el inventario genera un registro inmutable en la tabla movimientos_stock:

| Tipo     | Cuándo se genera                                        |
| -------- | ------------------------------------------------------- |
| ingreso  | Al registrar stock manualmente o recepcionar una compra |
| despacho | Al despachar una solicitud de insumo autorizada         |
| merma    | Al registrar pérdida, vencimiento o daño de un insumo   |
| ajuste   | Ajuste manual de inventario                             |

Cada movimiento almacena: insumo, tipo, cantidad, stock anterior, stock nuevo, usuario responsable,
referencia (ID de solicitud si aplica) y fecha/hora exacta. Este log es inmutable — no se permite
DELETE ni UPDATE directo, solo inserción mediante funciones RPC con seguridad definida del servidor
(SECURITY DEFINER).

---

## 6. Seguridad y Control de Acceso

El sistema implementa Row Level Security (RLS) en Supabase para garantizar que cada usuario solo
acceda a los datos que le corresponden:

- Los trabajadores solo ven solicitudes donde son destinatarios (trabajador_id = su ID).
- La jefatura ve las solicitudes que creó + las que le fueron asignadas a ella.
- El TENS y prevencionista ven todas las solicitudes del sistema para su gestión.
- El administrador tiene acceso irrestricto a todas las tablas.

La autenticación se realiza mediante email/contraseña a través de Supabase Auth. El perfil extendido
en la tabla usuarios almacena el RUT, nombre, rol, servicio y estado activo/inactivo. El contexto
de autenticación de la aplicación redirige automáticamente al inicio de sesión si no hay sesión
válida, y al dashboard correspondiente al rol una vez autenticado.

---

## 7. Estructura de la Base de Datos

| Tabla              | Descripción                                                  |
| ------------------ | ------------------------------------------------------------ |
| usuarios           | Perfiles vinculados a auth.users con rol, RUT y servicio     |
| insumos            | Catálogo de insumos con stock actual y mínimo                |
| pedidos            | Agrupador de solicitudes con número correlativo visible      |
| solicitudes        | Ítems individuales con ciclo de vida completo de estados     |
| entregas           | Registro de cada despacho físico con fecha y confirmación    |
| movimientos_stock  | Log inmutable de todos los cambios de inventario             |
| solicitudes_compra | Solicitudes de compra a proveedores con estado de aprobación |

---

_Informe generado el 5 de marzo de 2026._
