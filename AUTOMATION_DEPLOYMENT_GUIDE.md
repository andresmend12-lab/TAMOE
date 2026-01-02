# Guía de Deployment y Testing - Sistema de Automatizaciones TAMOE

## 📋 Resumen de Implementación

Se ha implementado un **sistema completo de automatizaciones** para TAMOE usando **exclusivamente Firebase** (sin dependencias externas como SendGrid):

### ✅ Componentes Implementados

1. **Motor de Ejecución (Cloud Functions)**
   - 4 triggers principales implementados
   - Sistema de validación de scope (cliente/proyecto/producto)
   - Ejecución de acciones (crear entidades hijas, notificaciones in-app)
   - Logging completo de ejecuciones

2. **Sistema de Logs**
   - Estructura `automation_logs/{automationId}/{logId}`
   - Timestamp automático
   - Tracking de resultados por acción
   - Actualización de `lastRun` en automatización

3. **Sistema de Notificaciones In-App (100% Firebase)**
   - Notificaciones guardadas en Firebase Realtime Database
   - Estructura `notifications/{userId}/{notificationId}`
   - Soporte para múltiples destinatarios
   - Información detallada de entidad
   - Estado de lectura (read/unread)
   - Sin dependencias externas

4. **UI Actualizada**
   - Datos reales en lugar de mock data
   - Iconos dinámicos basados en tipo de trigger
   - Formato de timestamp relativo y absoluto
   - Interfaz de creación y gestión de automatizaciones

---

## 🚀 Instrucciones de Deployment

### Paso 1: Verificar Dependencias

```bash
cd /home/user/TAMOE/functions
npm install
```

Dependencias requeridas (ya están en package.json):
- `firebase-admin`: ^11.11.1
- `firebase-functions`: ^4.5.0

**Nota**: No se requieren dependencias externas como SendGrid. El sistema usa únicamente Firebase.

### Paso 2: Deploy de Cloud Functions

```bash
cd /home/user/TAMOE
firebase deploy --only functions
```

Esto desplegará las siguientes funciones:
- `onTaskStatusChange` - Trigger cuando cambia el status de una tarea
- `onTaskCreated` - Trigger cuando se crea una nueva tarea
- `onProductCreated` - Trigger cuando se crea un nuevo producto
- `onProjectCreated` - Trigger cuando se crea un nuevo proyecto

### Paso 3: Verificar Deployment

```bash
firebase functions:log
```

Deberías ver logs confirmando que las funciones se desplegaron correctamente.

---

## 🧪 Plan de Testing End-to-End

### Test 1: Automatización de Cambio de Status con Notificación

**Objetivo**: Verificar que una automatización se ejecuta cuando una tarea cambia de status y crea una notificación in-app.

#### Configuración:
1. Ir a TAMOE → Automatizaciones → "Crear Automatización"
2. Crear automatización con:
   - **Nombre**: "Test: Notificar cuando tarea finalizada"
   - **Trigger**:
     - Tipo: `statusChange`
     - Tipo de actividad: `Task`
     - Estado inicial: `En proceso`
     - Estado final: `Finalizado`
   - **Acción**:
     - Tipo: `notify`
     - Recipients: `["userId1", "userId2"]` (IDs de usuarios de Firebase Auth)
     - Message: "Una tarea ha sido finalizada"
   - **Scope**: Todos los proyectos
   - **Estado**: Habilitada

#### Ejecución:
1. Crear una tarea de prueba con status "En proceso"
2. Cambiar el status de la tarea a "Finalizado"

#### Validación:
- [ ] Cloud Function se ejecuta (verificar en Firebase Console → Functions → Logs)
- [ ] Se crea un log en `automation_logs/{automationId}`
- [ ] El campo `lastRun` se actualiza en la automatización
- [ ] Se crean notificaciones en `notifications/{userId}` para cada destinatario
- [ ] Las notificaciones contienen información correcta de la tarea
- [ ] Las notificaciones tienen `read: false` inicialmente
- [ ] En la UI de Automatizaciones, "Última ejecución" ya no dice "Nunca"

---

### Test 2: Automatización de Creación de Tarea Hija

**Objetivo**: Verificar que se puede crear una subtarea automáticamente cuando se crea una tarea.

#### Configuración:
1. Crear automatización con:
   - **Nombre**: "Test: Crear subtarea automáticamente"
   - **Trigger**:
     - Tipo: `created`
     - Tipo de actividad: `Task`
   - **Acción**:
     - Tipo: `createChild_Subtarea`
     - Child name: "Subtarea automática - Revisión"
     - Status: `Pendiente`
   - **Scope**: Un proyecto específico

#### Ejecución:
1. Crear una nueva tarea en el proyecto configurado en el scope

#### Validación:
- [ ] Cloud Function se ejecuta
- [ ] Se crea automáticamente una subtarea con el nombre especificado
- [ ] La subtarea está vinculada correctamente a la tarea padre
- [ ] Log de ejecución contiene la ruta de la nueva entidad creada
- [ ] `lastRun` se actualiza correctamente

---

### Test 3: Automatización con Múltiples Acciones

**Objetivo**: Verificar que una automatización puede ejecutar múltiples acciones.

#### Configuración:
1. Crear automatización con:
   - **Nombre**: "Test: Múltiples acciones"
   - **Trigger**:
     - Tipo: `statusChange`
     - Tipo de actividad: `Task`
     - Estado final: `Bloqueado`
   - **Acciones**:
     1. Notificación a supervisor
     2. Creación de subtarea de seguimiento
   - **Scope**: Todos los proyectos

#### Ejecución:
1. Cambiar status de una tarea a "Bloqueado"

#### Validación:
- [ ] Ambas acciones se ejecutan
- [ ] Se envía la notificación
- [ ] Se crea la subtarea
- [ ] El log muestra ambas acciones con status "success"
- [ ] No hay errores en Firebase Functions logs

---

### Test 4: Scope de Automatización (Proyecto Específico)

**Objetivo**: Verificar que el scope funciona correctamente.

#### Configuración:
1. Crear automatización con:
   - **Scope**: Proyecto específico "Proyecto A"
   - **Trigger**: Creación de tarea
   - **Acción**: Notificación

#### Ejecución:
1. Crear tarea en "Proyecto A" → Debería ejecutarse
2. Crear tarea en "Proyecto B" → NO debería ejecutarse

#### Validación:
- [ ] Automatización se ejecuta solo en Proyecto A
- [ ] No se ejecuta en Proyecto B
- [ ] Logs muestran validación de scope

---

### Test 5: Manejo de Errores

**Objetivo**: Verificar que los errores se manejan correctamente.

#### Configuración:
1. Crear automatización con email inválido en recipients
2. Ejecutar la automatización

#### Validación:
- [ ] El error se captura y se registra en logs
- [ ] Status del log es "error" o "partial_success"
- [ ] La aplicación no se rompe
- [ ] Firebase Functions logs muestran el error detallado

---

### Test 6: UI - Visualización de Datos Reales

**Objetivo**: Verificar que la UI muestra datos reales correctamente.

#### Ejecución:
1. Ejecutar una automatización (cualquiera de los tests anteriores)
2. Ir a TAMOE → Automatizaciones

#### Validación:
- [ ] "Última ejecución" muestra timestamp real (no "Nunca")
- [ ] El timestamp se formatea correctamente:
  - "Hace X min" si fue reciente
  - "Hace X h" si fue hoy
  - "Hace X días" si fue esta semana
  - Fecha absoluta si fue hace más de una semana
- [ ] Los iconos se muestran dinámicamente:
  - `swap_horiz` para statusChange
  - `add_circle` para created
  - `person_add` para assigned
  - `schedule` para timeScheduled
  - `account_tree` para hierarchical
- [ ] El status (activa/pausada) se refleja correctamente

---

## 📊 Estructura de Datos

### Automation (Firebase Realtime Database)

```json
{
  "automations": {
    "{automationId}": {
      "name": "Nombre de la automatización",
      "enabled": true,
      "lastRun": 1672531200000,
      "scope": {
        "client": "all",
        "projects": ["projectId1", "projectId2"],
        "products": [
          {
            "projectId": "projectId1",
            "productId": "productId1"
          }
        ]
      },
      "triggers": [
        {
          "activityType": "Task",
          "triggerType": "statusChange",
          "fromState": "En proceso",
          "toState": "Finalizado"
        }
      ],
      "actions": [
        {
          "type": "notify",
          "recipients": ["userId1", "userId2"],
          "message": "Mensaje personalizado"
        },
        {
          "type": "createChild_Subtarea",
          "childName": "Nueva subtarea",
          "status": "Pendiente"
        }
      ]
    }
  }
}
```

### Automation Logs

```json
{
  "automation_logs": {
    "{automationId}": {
      "{logId}": {
        "timestamp": 1672531200000,
        "trigger": {
          "activityType": "Task",
          "triggerType": "statusChange"
        },
        "entityPath": "clients/{cId}/projects/{pId}/products/{prId}/tasks/{tId}",
        "fromStatus": "En proceso",
        "toStatus": "Finalizado",
        "actionResults": [
          {
            "actionType": "notify",
            "status": "success",
            "result": {
              "sent": true,
              "totalRecipients": 2,
              "successCount": 2
            }
          },
          {
            "actionType": "createChild_Subtarea",
            "status": "success",
            "result": {
              "path": "clients/.../subtasks/{newId}",
              "name": "Nueva subtarea"
            }
          }
        ],
        "status": "success"
      }
    }
  }
}
```

---

## 🔧 Cloud Functions Implementadas

### 1. onTaskStatusChange
**Ruta**: `/clients/{clientId}/projects/{projectId}/products/{productId}/tasks/{taskId}/status`
**Trigger**: `.onUpdate()`
**Descripción**: Ejecuta automatizaciones cuando cambia el status de una tarea.

### 2. onTaskCreated
**Ruta**: `/clients/{clientId}/projects/{projectId}/products/{productId}/tasks/{taskId}`
**Trigger**: `.onCreate()`
**Descripción**: Ejecuta automatizaciones cuando se crea una nueva tarea.

### 3. onProductCreated
**Ruta**: `/clients/{clientId}/projects/{projectId}/products/{productId}`
**Trigger**: `.onCreate()`
**Descripción**: Ejecuta automatizaciones cuando se crea un nuevo producto.

### 4. onProjectCreated
**Ruta**: `/clients/{clientId}/projects/{projectId}`
**Trigger**: `.onCreate()`
**Descripción**: Ejecuta automatizaciones cuando se crea un nuevo proyecto.

---

## 🔔 Sistema de Notificaciones In-App

Las notificaciones se guardan en Firebase Realtime Database bajo la ruta:

```
notifications/
  {userId}/
    {notificationId}/
      title: "..."
      message: "..."
      timestamp: 1672531200000
      read: false
      type: "automation"
      automationId: "..."
      automationName: "..."
      entityType: "Task"
      entityName: "..."
      entityPath: "clients/..."
      entityData: {...}
```

### Implementar UI de Notificaciones (Opcional):

Para mostrar las notificaciones en la aplicación, puedes crear un componente que:
1. Escuche cambios en `notifications/{currentUserId}`
2. Muestre un badge con el número de notificaciones no leídas
3. Permita marcar notificaciones como leídas
4. Navegue a la entidad relacionada al hacer clic

Ejemplo básico:
```javascript
const userId = firebase.auth().currentUser.uid;
const notificationsRef = database.ref(`notifications/${userId}`);

notificationsRef.orderByChild('read').equalTo(false).on('value', (snapshot) => {
  const unreadCount = snapshot.numChildren();
  // Actualizar badge UI
});
```

---

## 🐛 Troubleshooting

### Problema: Cloud Function no se ejecuta
**Solución**:
- Verificar que la automatización está habilitada (`enabled: true`)
- Verificar que el scope incluye la entidad que cambió
- Revisar logs: `firebase functions:log`

### Problema: No se crean notificaciones
**Solución**:
- Verificar que recipients[] contiene IDs de usuario válidos
- Revisar Firebase Database Rules para asegurar que las funciones tienen permiso de escritura en `notifications/`
- Revisar logs: `firebase functions:log` para ver errores específicos
- Verificar que la acción tiene type: "notify" correctamente configurado

### Problema: lastRun siempre dice "Nunca"
**Solución**:
- Verificar que la Cloud Function `logAutomationExecution()` se está ejecutando
- Verificar permisos de escritura en Firebase Database
- Refrescar la página de automatizaciones

### Problema: Iconos no aparecen correctamente
**Solución**:
- Verificar que Material Symbols está cargado en automations.html
- Limpiar cache del navegador
- Verificar que `triggerType` en el trigger tiene un valor válido

---

## ✅ Checklist de Implementación Completa

### Backend (Cloud Functions)
- [x] Motor de ejecución de automatizaciones
- [x] Trigger: onTaskStatusChange
- [x] Trigger: onTaskCreated
- [x] Trigger: onProductCreated
- [x] Trigger: onProjectCreated
- [x] Validación de scope (cliente/proyecto/producto)
- [x] Acción: createChild (Product/Task/Subtask)
- [x] Acción: notify (in-app notifications en Firebase)
- [x] Sistema de logging (automation_logs)
- [x] Actualización de lastRun
- [x] Manejo de errores y logs
- [x] Sin dependencias externas (100% Firebase)

### Frontend (UI)
- [x] Interfaz de listado de automatizaciones (automations.html)
- [x] Interfaz de creación de automatizaciones (create-automation.html)
- [x] Datos reales en lugar de mock data
- [x] Iconos dinámicos basados en trigger type
- [x] Formato de timestamp (relativo y absoluto)
- [x] Almacenamiento en Firebase de automatizaciones

### Pendiente (para deployment)
- [ ] Deploy de Cloud Functions a Firebase
- [ ] Testing end-to-end (6 tests listados arriba)
- [ ] Implementar UI para mostrar notificaciones in-app (opcional)
- [ ] Monitoreo de logs en producción
- [ ] Ajustes basados en resultados de testing

---

## 📚 Recursos Adicionales

- **Firebase Functions Docs**: https://firebase.google.com/docs/functions
- **Firebase Realtime Database Triggers**: https://firebase.google.com/docs/functions/database-events
- **Firebase Realtime Database Rules**: https://firebase.google.com/docs/database/security
- **Firebase Admin SDK**: https://firebase.google.com/docs/admin/setup

---

## 🎯 Próximos Pasos Recomendados

1. **Deployment Inmediato**:
   - Instalar Firebase CLI: `npm install -g firebase-tools`
   - Autenticar: `firebase login`
   - Deploy: `firebase deploy --only functions`

2. **Testing**:
   - Ejecutar los 6 tests end-to-end listados arriba
   - Documentar resultados y cualquier issue encontrado

3. **Implementar UI de Notificaciones** (opcional pero recomendado):
   - Crear componente de notificaciones en la navbar
   - Badge con contador de notificaciones no leídas
   - Panel dropdown con lista de notificaciones
   - Botón para marcar como leídas
   - Link directo a la entidad relacionada

4. **Mejoras Futuras** (opcional):
   - Dashboard de analytics de automatizaciones
   - Visor de logs en la UI
   - Más tipos de triggers (asignación, tiempo programado)
   - Más tipos de acciones (actualizar campo, cambiar status)
   - Rate limiting para evitar loops infinitos
   - Templates de automatizaciones pre-configuradas
   - Notificaciones push web usando Firebase Cloud Messaging (FCM)

---

**Documento creado**: 2026-01-02
**Última actualización**: 2026-01-02
**Versión**: 1.0
