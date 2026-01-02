# Guía de Deployment y Testing - Sistema de Automatizaciones TAMOE

## 📋 Resumen de Implementación

Se ha implementado un **sistema completo de automatizaciones** para TAMOE con las siguientes características:

### ✅ Componentes Implementados

1. **Motor de Ejecución (Cloud Functions)**
   - 4 triggers principales implementados
   - Sistema de validación de scope (cliente/proyecto/producto)
   - Ejecución de acciones (crear entidades hijas, notificaciones)
   - Logging completo de ejecuciones

2. **Sistema de Logs**
   - Estructura `automation_logs/{automationId}/{logId}`
   - Timestamp automático
   - Tracking de resultados por acción
   - Actualización de `lastRun` en automatización

3. **Sistema de Notificaciones**
   - Integración con SendGrid
   - Soporte para múltiples destinatarios
   - Templates HTML profesionales
   - Información detallada de entidad
   - Tracking de resultados por destinatario

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
- `@sendgrid/mail`: ^7.7.0

### Paso 2: Configurar Variables de Entorno

Crear archivo `/home/user/TAMOE/functions/.env` con:

```env
SENDGRID_API_KEY=tu_api_key_de_sendgrid
SENDGRID_SENDER_EMAIL=noreply@tudominio.com
```

**IMPORTANTE**: También configurar estas variables en Firebase Console:
```bash
firebase functions:config:set sendgrid.apikey="tu_api_key"
firebase functions:config:set sendgrid.sender="noreply@tudominio.com"
```

### Paso 3: Deploy de Cloud Functions

```bash
cd /home/user/TAMOE
firebase deploy --only functions
```

Esto desplegará las siguientes funciones:
- `onTaskStatusChange` - Trigger cuando cambia el status de una tarea
- `onTaskCreated` - Trigger cuando se crea una nueva tarea
- `onProductCreated` - Trigger cuando se crea un nuevo producto
- `onProjectCreated` - Trigger cuando se crea un nuevo proyecto

### Paso 4: Verificar Deployment

```bash
firebase functions:log
```

Deberías ver logs confirmando que las funciones se desplegaron correctamente.

---

## 🧪 Plan de Testing End-to-End

### Test 1: Automatización de Cambio de Status

**Objetivo**: Verificar que una automatización se ejecuta cuando una tarea cambia de status.

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
     - Recipients: `["tu_email@ejemplo.com"]`
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
- [ ] Se recibe un email en el destinatario configurado
- [ ] El email contiene información correcta de la tarea
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
          "recipients": ["email1@example.com", "email2@example.com"],
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

## 📧 Configuración de SendGrid

### Obtener API Key:
1. Ir a https://sendgrid.com/
2. Crear cuenta o iniciar sesión
3. Settings → API Keys → Create API Key
4. Dar permisos de "Mail Send"
5. Copiar la API Key

### Verificar Sender Email:
1. Settings → Sender Authentication
2. Verificar dominio o email individual
3. Usar email verificado en configuración de Firebase

---

## 🐛 Troubleshooting

### Problema: Cloud Function no se ejecuta
**Solución**:
- Verificar que la automatización está habilitada (`enabled: true`)
- Verificar que el scope incluye la entidad que cambió
- Revisar logs: `firebase functions:log`

### Problema: No se reciben notificaciones
**Solución**:
- Verificar SendGrid API Key configurada
- Verificar que el sender email está verificado en SendGrid
- Revisar logs de SendGrid para ver si hay errores
- Verificar que recipients[] contiene emails válidos

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
- [x] Acción: notify con SendGrid
- [x] Sistema de logging (automation_logs)
- [x] Actualización de lastRun
- [x] Manejo de errores y logs

### Frontend (UI)
- [x] Interfaz de listado de automatizaciones (automations.html)
- [x] Interfaz de creación de automatizaciones (create-automation.html)
- [x] Datos reales en lugar de mock data
- [x] Iconos dinámicos basados en trigger type
- [x] Formato de timestamp (relativo y absoluto)
- [x] Almacenamiento en Firebase de automatizaciones

### Pendiente (para deployment)
- [ ] Deploy de Cloud Functions a Firebase
- [ ] Configurar variables de entorno SendGrid
- [ ] Testing end-to-end (6 tests listados arriba)
- [ ] Monitoreo de logs en producción
- [ ] Ajustes basados en resultados de testing

---

## 📚 Recursos Adicionales

- **Firebase Functions Docs**: https://firebase.google.com/docs/functions
- **SendGrid Node.js Docs**: https://docs.sendgrid.com/for-developers/sending-email/v3-nodejs-code-example
- **Firebase Realtime Database Triggers**: https://firebase.google.com/docs/functions/database-events

---

## 🎯 Próximos Pasos Recomendados

1. **Deployment Inmediato**:
   - Instalar Firebase CLI: `npm install -g firebase-tools`
   - Autenticar: `firebase login`
   - Deploy: `firebase deploy --only functions`

2. **Testing**:
   - Ejecutar los 6 tests end-to-end listados arriba
   - Documentar resultados y cualquier issue encontrado

3. **Mejoras Futuras** (opcional):
   - Dashboard de analytics de automatizaciones
   - Visor de logs en la UI
   - Más tipos de triggers (asignación, tiempo programado)
   - Más tipos de acciones (actualizar campo, cambiar status)
   - Rate limiting para evitar loops infinitos
   - Templates de automatizaciones pre-configuradas

---

**Documento creado**: 2026-01-02
**Última actualización**: 2026-01-02
**Versión**: 1.0
