# Arquitectura TAMOE

## Visión General

TAMOE es un sistema de gestión de proyectos construido con Firebase y JavaScript vanilla. Este documento describe la arquitectura del sistema después de la refactorización.

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTE (Browser)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   UI Layer  │    │   State     │    │     Services Layer      │  │
│  │             │◄──►│   Store     │◄──►│                         │  │
│  │ - Modals    │    │             │    │ - firebase-service.js   │  │
│  │ - Calendar  │    │ store.js    │    │ - client-service.js     │  │
│  │ - Forms     │    │             │    │                         │  │
│  └─────────────┘    └─────────────┘    └───────────┬─────────────┘  │
│                                                     │                 │
└─────────────────────────────────────────────────────┼─────────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FIREBASE SERVICES                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │    Auth     │    │  Realtime   │    │    Cloud Functions      │  │
│  │             │    │  Database   │    │                         │  │
│  │ - Login     │    │             │    │ - sendInviteEmail       │  │
│  │ - Register  │    │ - clients   │    │ - validateClientCreation│  │
│  │ - Password  │    │ - users     │    │ - onClientDelete        │  │
│  │   Reset     │    │ - automations│   │ - getSystemStats        │  │
│  │             │    │ - notifications│ │ - exportClientData      │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐                                  │
│  │   Storage   │    │   Hosting   │                                  │
│  │             │    │             │                                  │
│  │ - Profile   │    │ - Static    │                                  │
│  │   Pictures  │    │   Files     │                                  │
│  └─────────────┘    └─────────────┘                                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Estructura de Directorios

```
TAMOE/
├── src/                          # Código fuente modular
│   ├── state/                    # Gestión de estado
│   │   └── store.js              # Store centralizado
│   ├── services/                 # Servicios de negocio
│   │   ├── firebase-service.js   # Operaciones Firebase
│   │   └── client-service.js     # CRUD de entidades
│   ├── ui/                       # Componentes UI
│   │   ├── modal-manager.js      # Gestión de modales
│   │   └── calendar.js           # Componente calendario
│   └── utils/                    # Utilidades
│       └── helpers.js            # Funciones auxiliares
│
├── functions/                    # Cloud Functions
│   ├── index.js                  # Funciones serverless
│   └── package.json              # Dependencias
│
├── tests/                        # Tests unitarios
│   ├── setup.js                  # Configuración de tests
│   ├── helpers.test.js           # Tests de utilidades
│   └── store.test.js             # Tests del store
│
├── docs/                         # Documentación
│   ├── ARCHITECTURE.md           # Este documento
│   ├── estructura_datos.md       # Estructura de datos
│   └── estructura_frontend.md    # Estructura frontend
│
├── *.html                        # Páginas HTML
├── *.js                          # Scripts principales
├── database.rules.json           # Reglas de seguridad
├── storage.rules                 # Reglas de storage
├── firebase.json                 # Configuración Firebase
├── package.json                  # Dependencias proyecto
└── vitest.config.js              # Configuración tests
```

## Modelo de Datos

### Jerarquía Principal

```
clients/
└── {clientId}/
    ├── name: string
    ├── createdAt: ISO string
    ├── createdBy: string (uid)      # NUEVO - para permisos
    ├── manageId: string (ej: "TC-001")
    ├── managePrefix: string
    ├── manageNextNumber: number
    │
    ├── activity_logs/
    │   └── {logId}/
    │       ├── actorUid, actorName
    │       ├── action, description
    │       └── timestamp
    │
    └── projects/
        └── {projectId}/
            ├── name, status, manageId
            │
            ├── products/
            │   └── {productId}/
            │       ├── name, status, manageId
            │       └── tasks/
            │           └── {taskId}/...
            │
            └── tasks/
                └── {taskId}/
                    ├── name, status, manageId
                    ├── assigneeUid, description
                    ├── priority, dueDate
                    │
                    └── subtasks/
                        └── {subtaskId}/...
```

### Usuarios y Notificaciones

```
users/
└── {uid}/
    ├── username: string
    ├── email: string
    ├── department: string
    ├── profile_picture: string
    └── role: string (opcional, "admin")

notifications/
└── {uid}/
    └── {notificationId}/
        ├── title, taskName, manageId
        ├── fromUid, fromName
        ├── read: boolean
        └── createdAt: timestamp
```

## Flujo de Datos

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Usuario    │────►│   UI Layer   │────►│    Store     │
│   Interacción│     │   (Eventos)  │     │  (Estado)    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   Firebase   │◄────│   Services   │
                     │   (RTDB)     │     │   (CRUD)     │
                     └──────┬───────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Cloud      │
                     │   Functions  │
                     │  (Validación)│
                     └──────────────┘
```

## Patrones de Diseño

### 1. Store Pattern (Estado Centralizado)

```javascript
// src/state/store.js
import { store } from './store.js';

// Leer estado
const clients = store.get('allClients');
const user = store.get('currentUser');

// Actualizar estado
store.set({ selectedClientId: 'client-123' });
store.setKey('clientsLoading', true);

// Suscribirse a cambios
const unsubscribe = store.subscribe((state, oldState) => {
  console.log('Estado actualizado:', state);
}, ['selectedClientId']); // Filtrar por keys
```

### 2. Service Pattern (Operaciones de Negocio)

```javascript
// src/services/client-service.js
import * as clientService from './client-service.js';

// Crear cliente
const clientId = await clientService.createClient('Nuevo Cliente');

// Actualizar proyecto
await clientService.updateProject(clientId, projectId, { status: 'Finalizado' });

// Crear tarea con notificación
await clientService.createTask(
  { clientId, projectId },
  'Nueva Tarea',
  { assigneeUid: 'user-123', priority: 'Alta' }
);
```

### 3. Modal Manager (UI Reutilizable)

```javascript
// src/ui/modal-manager.js
import { registerModal, openModal, closeModal, confirm, toast } from './modal-manager.js';

// Registrar modal
registerModal('add-client-modal', {
  onOpen: (data) => console.log('Modal abierto con:', data),
  onClose: () => console.log('Modal cerrado')
});

// Abrir modal
openModal('add-client-modal', { prefillName: 'Test' });

// Confirmación
const confirmed = await confirm({
  title: 'Eliminar cliente',
  message: '¿Estás seguro?',
  type: 'danger'
});

// Toast
toast({ message: 'Cliente creado', type: 'success' });
```

## Seguridad

### Reglas de Base de Datos

Las reglas de seguridad implementan:

1. **Autenticación requerida** para todas las operaciones
2. **Validación de propiedad** (createdBy)
3. **Validación de esquema** para cada campo
4. **Índices** para optimizar consultas
5. **Roles de administrador** opcionales

```json
{
  "clients": {
    "$clientId": {
      ".write": "auth != null && (
        !data.exists() ||
        data.child('createdBy').val() === auth.uid ||
        root.child('users').child(auth.uid).child('role').val() === 'admin'
      )",
      "name": {
        ".validate": "newData.isString() && newData.val().length >= 1"
      }
    }
  }
}
```

### Cloud Functions

Las funciones serverless proporcionan:

1. **Rate limiting** para prevenir abuso
2. **Validación server-side** de datos
3. **Auditoría** de operaciones sensibles
4. **Sanitización** de entradas
5. **Funciones programadas** para limpieza

## Testing

### Configuración

```bash
# Ejecutar tests
npm test

# Tests con cobertura
npm run test:coverage

# Tests con UI
npm run test:ui
```

### Estructura de Tests

```javascript
// tests/helpers.test.js
import { describe, it, expect } from 'vitest';
import { formatManageId } from '../src/utils/helpers.js';

describe('formatManageId', () => {
  it('should format manage ID correctly', () => {
    expect(formatManageId('TC', 1)).toBe('TC-001');
  });
});
```

### Custom Matchers

```javascript
// Validar formato de manageId
expect('TC-001').toBeValidManageId();

// Validar status
expect('Pendiente').toBeValidStatus();

// Validar prioridad
expect('Alta').toBeValidPriority();
```

## Rendimiento

### Optimizaciones Implementadas

1. **Índices en Firebase** para consultas frecuentes
2. **Listeners selectivos** en lugar de escuchar todo
3. **Debounce** en búsquedas
4. **Lazy loading** de módulos (futuro)

### Métricas Objetivo

| Métrica | Objetivo | Actual |
|---------|----------|--------|
| First Contentful Paint | < 1.5s | ~2s |
| Time to Interactive | < 3s | ~4s |
| Bundle Size | < 200KB | ~240KB |

## Migración

### De client-manager.js a Módulos

El archivo monolítico `client-manager.js` (5,347 líneas) se ha dividido en:

| Módulo | Responsabilidad | Líneas |
|--------|-----------------|--------|
| `store.js` | Estado global | ~250 |
| `helpers.js` | Utilidades | ~400 |
| `firebase-service.js` | Operaciones DB | ~350 |
| `client-service.js` | Lógica de negocio | ~400 |
| `modal-manager.js` | Gestión modales | ~300 |
| `calendar.js` | Calendario | ~350 |

### Compatibilidad

El código existente en `client-manager.js` sigue funcionando. Los nuevos módulos están disponibles para uso gradual.

## Próximos Pasos

1. **Completar migración** del código restante en client-manager.js
2. **Implementar lazy loading** con dynamic imports
3. **Añadir service worker** para offline support
4. **Implementar sistema de roles** completo
5. **Añadir más tests** para cobertura > 80%
