# Guía de Desarrollo TAMOE

## Requisitos Previos

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Cuenta de Firebase con proyecto configurado

## Configuración Inicial

### 1. Clonar y configurar

```bash
# Clonar repositorio
git clone <repository-url>
cd TAMOE

# Instalar dependencias
npm install

# Instalar dependencias de Cloud Functions
cd functions && npm install && cd ..
```

### 2. Configurar Firebase

```bash
# Login en Firebase
firebase login

# Seleccionar proyecto
firebase use tamoe-86320208-a33cf

# Configurar variables de entorno para funciones
firebase functions:config:set sendgrid.key="SG.xxx" sendgrid.sender="noreply@tamoe.app"
```

### 3. Ejecutar localmente

```bash
# Iniciar emuladores de Firebase
npm run dev

# O directamente
firebase emulators:start
```

## Estructura del Proyecto

```
src/
├── state/          # Gestión de estado
├── services/       # Lógica de negocio
├── ui/             # Componentes de interfaz
└── utils/          # Utilidades compartidas
```

## Desarrollo

### Crear un nuevo servicio

```javascript
// src/services/mi-servicio.js
import { store } from '../state/store.js';
import * as fb from './firebase-service.js';
import { logError } from '../utils/helpers.js';

export const miFuncion = async (data) => {
  const currentUser = store.get('currentUser');
  if (!currentUser) {
    throw new Error('Autenticación requerida');
  }

  try {
    // Lógica del servicio
    await fb.setData(`mi-path/${data.id}`, data);
    return data.id;
  } catch (error) {
    logError('miFuncion', error);
    throw error;
  }
};
```

### Agregar nuevo componente UI

```javascript
// src/ui/mi-componente.js
import { store } from '../state/store.js';
import { getEl, showEl, hideEl } from '../utils/helpers.js';

let elementos = null;

export const initMiComponente = (config) => {
  elementos = {
    container: getEl(config.containerId),
    // ... más elementos
  };

  setupEventListeners();

  // Suscribirse a cambios de estado
  store.subscribe((state) => {
    render(state);
  }, ['miPropiedad']);
};

const setupEventListeners = () => {
  // Configurar event listeners
};

const render = (state) => {
  // Renderizar componente
};

export const show = () => showEl(elementos?.container);
export const hide = () => hideEl(elementos?.container);
```

### Agregar nueva Cloud Function

```javascript
// functions/index.js

exports.miFuncion = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    // 1. Verificar autenticación
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Autenticación requerida"
      );
    }

    // 2. Rate limiting
    const allowed = await checkRateLimit(context.auth.uid, "miFuncion");
    if (!allowed) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Límite excedido"
      );
    }

    // 3. Validar datos
    const param = sanitizeString(data?.param, 100);
    if (!param) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Parámetro requerido"
      );
    }

    // 4. Ejecutar lógica
    try {
      // ...
      return { ok: true };
    } catch (error) {
      console.error("Error en miFuncion:", error);
      throw new functions.https.HttpsError("internal", "Error interno");
    }
  });
```

## Testing

### Ejecutar tests

```bash
# Todos los tests
npm test

# Tests en modo watch
npm test -- --watch

# Tests con cobertura
npm run test:coverage

# Tests con UI visual
npm run test:ui
```

### Escribir un test

```javascript
// tests/mi-modulo.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { miFuncion } from '../src/services/mi-servicio.js';

describe('miFuncion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return expected result', async () => {
    const result = await miFuncion({ id: 'test' });
    expect(result).toBe('test');
  });

  it('should throw when not authenticated', async () => {
    // Mock store sin usuario
    vi.mock('../src/state/store.js', () => ({
      store: {
        get: vi.fn(() => null)
      }
    }));

    await expect(miFuncion({ id: 'test' }))
      .rejects.toThrow('Autenticación requerida');
  });
});
```

### Mocks comunes

```javascript
// Mock de usuario autenticado
const mockUser = createMockUser({ uid: 'test-123' });

// Mock de cliente
const mockClient = createMockClient({
  clientId: 'client-123',
  name: 'Test Client'
});

// Mock de tarea
const mockTask = createMockTask({
  taskId: 'task-123',
  status: 'En proceso'
});
```

## Despliegue

### Desplegar todo

```bash
npm run deploy
```

### Desplegar solo funciones

```bash
npm run deploy:functions
```

### Desplegar solo reglas

```bash
npm run deploy:rules
```

### Verificar antes de desplegar

```bash
# Ejecutar tests
npm run test:run

# Verificar reglas
firebase deploy --only database --dry-run

# Verificar funciones
cd functions && npm run lint && cd ..
```

## Convenciones de Código

### Nomenclatura

- **Archivos**: kebab-case (`client-service.js`)
- **Funciones**: camelCase (`createClient`)
- **Clases**: PascalCase (`Store`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_REQUESTS`)

### Imports

```javascript
// 1. Módulos externos
import { ref } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// 2. Módulos internos (services)
import * as fb from './firebase-service.js';

// 3. State
import { store } from '../state/store.js';

// 4. Utilities
import { logError, formatDate } from '../utils/helpers.js';
```

### Documentación

```javascript
/**
 * Descripción breve de la función
 * @param {string} clientId - ID del cliente
 * @param {Object} options - Opciones adicionales
 * @param {string} [options.name] - Nombre opcional
 * @returns {Promise<string>} ID generado
 * @throws {Error} Si no hay autenticación
 */
export const miFuncion = async (clientId, options = {}) => {
  // ...
};
```

### Manejo de Errores

```javascript
// En servicios
try {
  await operacionRiesgosa();
} catch (error) {
  logError('contexto', error);
  throw error; // Re-throw para que el caller maneje
}

// En UI
try {
  await servicio.operacion();
  toast({ message: 'Operación exitosa', type: 'success' });
} catch (error) {
  toast({ message: formatErrorMessage(error), type: 'error' });
}
```

## Troubleshooting

### Error: "Permission denied"

1. Verificar autenticación del usuario
2. Revisar reglas de seguridad
3. Verificar que `createdBy` esté configurado

### Error: "Rate limit exceeded"

1. Esperar 1 minuto
2. Si persiste, verificar que las funciones no estén en loop

### Error: "Invalid manage ID"

1. Verificar formato: `XX-NNN`
2. Revisar `manageNextNumber` en cliente

### Tests fallan localmente

1. Verificar que los mocks estén configurados
2. Ejecutar `npm run test:run` para ver errores detallados
3. Verificar setup.js

## Recursos

- [Firebase Documentation](https://firebase.google.com/docs)
- [Vitest Documentation](https://vitest.dev/)
- [Tailwind CSS](https://tailwindcss.com/docs)
