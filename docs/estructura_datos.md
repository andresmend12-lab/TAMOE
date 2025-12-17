# Estructura de datos (Firebase Realtime Database)

## Rutas principales

### Usuarios
- `users/{uid}`
  - `username`: string
  - `email`: string
  - `department`: string
  - `profile_picture`: string (URL)

### Clientes / Proyectos / Productos / Tareas / Subtareas
- `clients/{clientId}`
  - `clientId`: string (llave generada por RTDB)
  - `name`: string
  - `createdAt`: ISO string
  - `manageId`: string (ej: `NN-001`)
  - `managePrefix`: string (ej: `NN`)
  - `manageNextNumber`: number (siguiente número a asignar)
  - `activity_logs/{logId}` (historial persistente)
    - `actorUid`: string
    - `actorName`: string
    - `description`: string
    - `timestamp`: server timestamp
    - `action`: string (ej: `status_update`, `assignee_update`, `rename`, `delete`, `automation_qc`)
    - `path`: string (ruta RTDB del elemento afectado)
    - `entityType`: string (`client|project|product|task|subtask`)
    - `source`: string (opcional, ej: `user|cascade`)
    - `assigneeUid`: string (opcional, si aplica)
    - `sourcePath`: string (opcional, automatizaciones)
  - `projects/{projectId}`
    - `projectId`: string
    - `name`: string
    - `createdAt`: ISO string
    - `manageId`: string
    - `status`: string (`Pendiente|En proceso|Finalizado`)
    - `products/{productId}`
      - `productId`: string
      - `name`: string
      - `createdAt`: ISO string
      - `manageId`: string
      - `status`: string (`Pendiente|En proceso|Finalizado`)
      - `tasks/{taskId}`
        - `taskId`: string
        - `name`: string
        - `status`: string (`Pendiente|En proceso|Finalizado`)
        - `assigneeUid`: string (uid o vacío)
        - `description`: string (opcional)
        - `createdAt`: ISO string
        - `manageId`: string
        - `automation` (opcional, tareas automáticas)
          - `template`: string (ej: `qc_review`)
          - `sourcePath`: string
          - `sourceType`: string (`task|product`)
          - `sourceName`: string
          - `sourceManageId`: string
          - `createdByUid`: string
          - `createdAt`: ISO string
        - `comments/{commentId}` (opcional)
          - `text`: string
          - `userId`: string
          - `userName`: string
          - `userDepartment`: string
          - `userPhoto`: string
          - `createdAt`: ISO string
        - `subtasks/{subtaskId}`
          - `subtaskId`: string
          - `name`: string
          - `status`: string (`Pendiente|En proceso|Finalizado`)
          - `assigneeUid`: string (uid o vacío)
          - `createdAt`: ISO string
          - `manageId`: string
    - `tasks/{taskId}`
      - `taskId`: string
      - `name`: string
      - `status`: string (`Pendiente|En proceso|Finalizado`)
      - `assigneeUid`: string (uid o vacío)
      - `description`: string (opcional)
      - `createdAt`: ISO string
      - `manageId`: string
      - `automation` (opcional, tareas automáticas)
        - `template`: string (ej: `qc_review`)
        - `sourcePath`: string
        - `sourceType`: string (`task|product`)
        - `sourceName`: string
        - `sourceManageId`: string
        - `createdByUid`: string
        - `createdAt`: ISO string
      - `comments/{commentId}` (opcional)
        - `text`: string
        - `userId`: string
        - `userName`: string
        - `userDepartment`: string
        - `userPhoto`: string
        - `createdAt`: ISO string
      - `subtasks/{subtaskId}`
        - `subtaskId`: string
        - `name`: string
        - `status`: string (`Pendiente|En proceso|Finalizado`)
        - `assigneeUid`: string (uid o vacío)
        - `createdAt`: ISO string
        - `manageId`: string

### Notificaciones
- `notifications/{uid}/{notificationId}`
  - `title`: string
  - `taskName`: string
  - `fromUid`: string
  - `fromName`: string
  - `read`: boolean
  - `createdAt`: server timestamp

## Campos propuestos (estilo Jira)
Para `task` y `subtask`:
- `priority`: string (`Alta|Media|Baja`) (default: `Media`)
- `dueDate`: string (`YYYY-MM-DD`) o ISO string (default: vacío)
- `tags`: map `{ [tagSlug]: true }` (o array de strings)

## Reglas actuales (`database.rules.json`)
- Lectura y escritura de `clients` permitida para cualquier usuario autenticado.
- Lectura y escritura de su propio nodo en `users/{uid}` limitada al usuario autenticado.
- `notifications/{uid}`: lectura sólo para el propio usuario; escritura actualmente permitida a usuarios autenticados (recomendado endurecerla).

## Consideraciones
- No se usa `ownerId`; todos los usuarios autenticados ven y crean clientes/proyectos de forma compartida.
- Los IDs (`clientId`, `projectId`, etc.) se derivan de las keys autogeneradas por `push()`.
