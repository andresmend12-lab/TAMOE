# Estructura de datos (Firebase Realtime Database)

## Rutas principales
- `users/{uid}`  
  - `username`: string  
  - `email`: string  
  - `department`: string  
  - `profile_picture`: string (URL)

- `clients/{clientId}`  
  - `clientId`: string (llave generada por RTDB)  
  - `name`: string  
  - `createdAt`: ISO string  
  - `manageId`: string (ej: `NN-001`)  
  - `managePrefix`: string (ej: `NN`)  
  - `manageNextNumber`: number (siguiente número a asignar)  
  - `projects/{projectId}`  
    - `projectId`: string  
    - `name`: string  
    - `createdAt`: ISO string  
    - `manageId`: string  
    - `products/{productId}`  
      - `productId`: string  
      - `name`: string  
      - `createdAt`: ISO string  
      - `manageId`: string  
      - `tasks/{taskId}`  
        - `taskId`: string  
        - `name`: string  
        - `createdAt`: ISO string  
        - `manageId`: string  
        - `subtasks/{subtaskId}`  
          - `subtaskId`: string  
          - `name`: string  
          - `createdAt`: ISO string  
          - `manageId`: string  
    - `tasks/{taskId}`  
      - `taskId`: string  
      - `name`: string  
      - `createdAt`: ISO string
      - `manageId`: string  
      - `subtasks/{subtaskId}`  
        - `subtaskId`: string  
        - `name`: string  
        - `createdAt`: ISO string  
        - `manageId`: string

## Reglas actuales (`database.rules.json`)
- Lectura y escritura de `clients` permitida para cualquier usuario autenticado.
- Lectura y escritura de su propio nodo en `users/{uid}` limitada al usuario autenticado.

## Consideraciones
- No se usa `ownerId`; todos los usuarios autenticados ven y crean clientes/proyectos de forma compartida.
- Los IDs (`clientId`, `projectId`, etc.) se derivan de las keys autogeneradas por `push()`.
