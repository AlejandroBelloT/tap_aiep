# Instructivo de Usuario — Sistema de Gestión de Insumos TAP

**Versión:** 1.0  
**Fecha:** Marzo 2026

---

## ¿Qué es este sistema?

El **Sistema de Gestión de Insumos TAP** permite administrar de forma digital el ciclo completo de
los insumos de seguridad y equipos de protección personal (EPP): desde que se solicitan hasta que
llegan a manos del trabajador, pasando por aprobación, despacho y confirmación de recepción.
También gestiona reposición de stock mediante solicitudes de compra a proveedores.

---

## Acceso al sistema

1. Ingresar la dirección web en el navegador.
2. Escribir el **correo electrónico** y la **contraseña** asignados por el Administrador.
3. El sistema redirige automáticamente al panel correspondiente según el rol del usuario.

> Si olvidó su contraseña, contacte al Administrador del sistema para que la restablezca.

---

## Roles y qué puede hacer cada uno

| Rol                | Capacidades principales                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Trabajador**     | Confirmar recepción de insumos, ver historial de sus solicitudes                                                  |
| **Jefatura**       | Todo lo anterior + crear solicitudes de insumos para trabajadores                                                 |
| **TENS**           | Gestionar inventario, autorizar y despachar solicitudes, registrar mermas, solicitar compras, recepcionar compras |
| **Prevencionista** | Todo lo de Jefatura + todo lo de TENS                                                                             |
| **Administrador**  | Control total: usuarios, catálogo de insumos, solicitudes de compra, reportes globales                            |

---

## Manual por rol

---

### TRABAJADOR

#### Panel de inicio

Al ingresar verá tres tarjetas con:

- **Insumos por confirmar:** entregas despachadas que aún no ha confirmado recibir.
- **Insumos recibidos:** total histórico de insumos recibidos.
- **Solicitudes en curso:** solicitudes pendientes o en proceso.

Si hay insumos esperando confirmación, aparece un **banner de alerta** en la parte superior con un
botón para ir directo a esa sección.

#### Confirmar recepción de un insumo

1. Ir a la sección **Mis Recepciones** (o hacer clic en el banner de alerta).
2. Cada insumo despachado aparece como una tarjeta con el nombre del insumo, cantidad y quien lo envió.
3. Verifique físicamente que recibió el insumo correcto y en la cantidad indicada.
4. Hacer clic en **"Confirmar Recepción"**.
5. El sistema registra la fecha y hora exacta de la recepción.

#### Ver mis solicitudes

1. Ir a **Mis Solicitudes**.
2. Se muestra el historial de todas las solicitudes creadas a su nombre.
3. Cada solicitud muestra el progreso en 4 etapas: **Pendiente → Autorizada → Despachada → Recibida**.
4. Puede filtrar por estado usando los botones en la parte superior.

---

### JEFATURA

Tiene todo lo del **Trabajador**, más:

#### Crear una solicitud de insumos

1. Ir a **Mis Solicitudes** → botón **"Nueva Solicitud"**.
2. Buscar al **trabajador destinatario** por nombre o RUT en el buscador (aparecen sugerencias al escribir).
3. Hacer clic en **"+ Agregar insumo"** para incluir insumos al pedido:
   - Seleccionar el insumo del listado (solo aparecen insumos con stock disponible).
   - Indicar la cantidad.
   - Repetir para cada insumo que necesite incluir.
4. Opcionalmente escribir un **motivo** del pedido.
5. Hacer clic en **"Enviar Solicitud"**.

El sistema asigna un número de pedido correlativo visible (Pedido #001, #002…) y crea una
solicitud individual por cada insumo incluido. El estado inicial es **Pendiente**.

> La jefatura también puede solicitar insumos para sí misma como destinataria.

---

### TENS

Tiene todo lo del **Trabajador**, más los módulos de gestión de inventario y solicitudes.

#### Panel de inicio

Muestra en tiempo real:

- Total de insumos activos y cuántos están bajo el stock mínimo.
- Solicitudes pendientes de revisión.
- Solicitudes autorizadas listas para despachar.
- Sus despachos realizados y estado de sus solicitudes de compra.

#### Gestión de Inventario — Registrar ingreso de stock

1. Ir a **Inventario**.
2. Localizar el insumo en la tabla (se puede buscar por nombre o código).
3. Hacer clic en el botón **"Ingresar Stock"** del insumo correspondiente.
4. Ingresar la cantidad a agregar.
5. Opcionalmente escribir una observación.
6. Confirmar. El stock se actualiza automáticamente.

#### Gestión de Inventario — Registrar merma

1. Ir a **Inventario**.
2. Localizar el insumo y hacer clic en **"Registrar Merma"**.
3. Ingresar la cantidad perdida/dañada/vencida.
4. Escribir la **justificación** (campo obligatorio).
5. Confirmar. El stock se descuenta y queda registrado en el historial de movimientos.

#### Gestionar solicitudes de trabajadores

1. Ir a **Solicitudes Pendientes**.
2. Las solicitudes aparecen agrupadas por estado.

**Para autorizar una solicitud pendiente:**

- Revisar los datos (trabajador, insumo, cantidad, motivo).
- Hacer clic en **"Autorizar"**. El estado pasa a _Autorizada_.

**Para despachar una solicitud autorizada:**

- Hacer clic en **"Despachar"**.
- El sistema descuenta el stock automáticamente, registra el movimiento y genera el aviso de entrega para el trabajador.
- El estado pasa a _Despachada_.

**Para rechazar una solicitud:**

- Hacer clic en **"Rechazar"**.
- Escribir el motivo del rechazo (obligatorio).
- Confirmar. El estado pasa a _Rechazada_.

#### Solicitar compra a proveedor

Cuando el stock de un insumo es insuficiente para atender la demanda:

1. Ir a **Solicitud de Compra** → **"Nueva Solicitud de Compra"**.
2. Completar los campos:
   - **Nivel de urgencia:** Normal / Urgente / Crítico.
   - **Proveedor sugerido** (opcional).
   - **Justificación.**
3. En la tabla de ítems, hacer clic en **"+ Agregar ítem"** por cada insumo a comprar:
   - Nombre del insumo, código, cantidad, unidad de medida y precio estimado.
4. Enviar. Se asigna un número correlativo visible (SC-0001, SC-0002…).

La solicitud queda en estado **Pendiente** hasta que el Administrador la revise.

#### Recepcionar una compra aprobada

1. Ir a **Recepción de Compras**.
2. Aparecen las solicitudes de compra aprobadas por el Administrador.
3. Seleccionar la compra y hacer clic en **"Recepcionar"**.
4. Verificar y confirmar las cantidades recibidas por ítem.
5. Confirmar. El stock de cada insumo se actualiza y queda registrado el movimiento de ingreso con referencia a la solicitud de compra.

---

### PREVENCIONISTA

Tiene acceso completo a **todos los módulos del TENS y la Jefatura** desde un único panel con
sidebar organizado en secciones:

- **Gestión de Insumos:** Inventario, ingreso de stock, mermas, consultar stock.
- **Solicitudes de Compra:** Crear y ver solicitudes de compra, recepcionar compras.
- **Solicitudes de Trabajadores:** Revisar, autorizar, despachar y rechazar solicitudes.
- **Mis Solicitudes:** Crear solicitudes de insumos, ver las recibidas, confirmar despachos.

El funcionamiento de cada módulo es idéntico al descrito para TENS y Jefatura.

---

### ADMINISTRADOR

Tiene acceso total al sistema. Su panel incluye secciones adicionales exclusivas.

#### Panel de inicio

Estadísticas globales del sistema:

- Total de usuarios activos por rol.
- Total de solicitudes.
- Solicitudes activas (pendientes + en proceso).
- Insumos bajo el stock mínimo.

#### Gestión de usuarios

1. Ir a **Usuarios** en el menú lateral.
2. Se muestra la tabla de todos los usuarios con su rol, servicio y estado.

**Crear un usuario nuevo:**

1. Hacer clic en **"Nuevo Usuario"**.
2. Completar: RUT, nombre completo, correo electrónico, contraseña temporal, rol y servicio.
3. Guardar. El usuario puede ingresar de inmediato con esas credenciales.

**Editar un usuario:**

1. Hacer clic en el ícono de edición de la fila correspondiente.
2. Modificar los campos necesarios (nombre, rol, servicio, estado activo/inactivo).
3. Guardar cambios.

> Desactivar un usuario impide que pueda iniciar sesión, pero sus registros históricos se conservan.

**Eliminar un usuario:**

1. Hacer clic en el ícono de eliminar.
2. Confirmar la acción. Esta operación no se puede deshacer.

#### Gestión del catálogo de insumos

1. Ir a **Insumos / Catálogo**.

**Crear un insumo:**

1. Hacer clic en **"Nuevo Insumo"**.
2. Completar: nombre, descripción, código, unidad de medida, stock actual y stock mínimo.
3. Guardar.

**Editar un insumo:**

- Hacer clic en el ícono de edición y modificar los campos necesarios.

**Desactivar un insumo:**

- Los insumos no se eliminan definitivamente para preservar el historial.
- Al desactivarlos, dejan de aparecer en el catálogo de solicitudes pero sus registros históricos se mantienen.

#### Gestión de solicitudes de compra

1. Ir a **Solicitudes de Compra**.
2. Las solicitudes emitidas por TENS y Prevencionistas aparecen listadas.

**Para aprobar:**

- Revisar el detalle de la solicitud (ítems, cantidades, precios estimados, proveedor, urgencia).
- Hacer clic en **"Aprobar"**. La solicitud queda disponible para recepción por el TENS.

**Para rechazar:**

- Hacer clic en **"Rechazar"**, escribir las observaciones y confirmar.

#### Reportes globales

1. Ir a **Reportes** en el menú lateral.
2. Seleccionar el tipo de reporte en la barra de sub-pestañas:

| Sub-pestaña             | Qué muestra                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| 📊 Solicitudes Globales | Listado completo de todas las solicitudes con filtros por estado, fecha y búsqueda libre. |
| 👤 Por Trabajador       | Historial de insumos recibidos por un trabajador en un período.                           |
| 📥 Entradas             | Todos los ingresos de stock del período, con insumo, origen y responsable.                |
| ⚠️ Mermas               | Mermas registradas del período (todos los insumos o uno específico).                      |
| 📦 Entregas             | Solicitudes completadas filtradas por insumo con datos del receptor.                      |

**Configurar el período de un reporte:**

- Usar el selector de período (Hoy / Últimos 7 días / Últimos 30 días / Rango personalizado).

**Filtrar por insumo:**

- En los reportes que lo permiten, escribir el nombre del insumo en el campo de búsqueda.
- Aparece una lista desplegable con las coincidencias; hacer clic para seleccionar.

**Exportar a CSV:**

- Hacer clic en el botón **"⬇️ CSV"** disponible en cada reporte.
- El archivo se descarga automáticamente con los datos del período y filtros aplicados.

---

## Flujo general de una solicitud de insumos

```
Jefatura / Prevencionista crea la solicitud
          ↓
     [PENDIENTE]
          ↓  TENS / Prevencionista la revisa y autoriza
     [AUTORIZADA]
          ↓  TENS / Prevencionista la despacha físicamente
     [DESPACHADA]  ← el trabajador recibe notificación
          ↓  Trabajador confirma haber recibido el insumo
     [RECIBIDA]

     En cualquier etapa activa, el TENS puede:
          ↓
     [RECHAZADA]  ← con motivo obligatorio
```

---

## Flujo de reposición de stock

```
TENS / Prevencionista detecta stock bajo
          ↓
Crea Solicitud de Compra (SC-XXXX)
          ↓  Administrador revisa y aprueba
     [APROBADA]
          ↓  TENS recepciona la mercadería físicamente
Stock actualizado + movimiento registrado automáticamente
```

---

## Preguntas frecuentes

**¿Qué pasa si el stock no alcanza para despachar una solicitud?**  
El sistema no bloqueará la autorización, pero al intentar despachar, si el stock es insuficiente,
se mostrará un error. El TENS debe registrar primero un ingreso de stock o crear una solicitud de
compra.

**¿Puedo deshacer una confirmación de recepción?**  
No. Una vez que se confirma la recepción, el estado es definitivo para garantizar la integridad del
registro. Si existió un error, debe comunicarlo al Administrador.

**¿Dónde veo el historial de movimientos de un insumo?**  
El Administrador puede ver el historial completo desde los **Reportes de Entradas y Mermas**. El
TENS puede ver los movimientos desde la vista de inventario.

**¿Qué significa "stock mínimo"?**  
Es el umbral de alerta. Cuando el stock actual de un insumo cae por debajo de ese número, aparece
una indicación visual en la tabla de inventario para alertar al TENS de que debe reponer.

**¿El sistema funciona en tiempo real?**  
Sí. Los paneles de trabajador, jefatura, TENS y administrador se actualizan automáticamente cuando
otro usuario realiza cambios, sin necesidad de recargar la página.

---

_Para soporte técnico o creación de cuentas de usuario, contactar al Administrador del sistema._
