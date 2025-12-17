# Estructura del frontend

## Páginas principales
- `login.html`: Inicio de sesión. Sin registro ni Google; solo email/contraseña.
- `register.html`: Registro manual con selección de departamento.
- `maindashboard.html`: Vista principal con sidebar de clientes/proyectos y panel superior. Incluye modales para clientes, proyectos, productos y tareas.
- `profile.html`: Edición de perfil (nombre, correo, departamento, foto, contraseña) con cambio de tema.

## Scripts clave
- `client-manager.js`: Lógica de clientes/proyectos/productos/tareas, modales, y sincronización con RTDB.
- `auth.js`: Registro e inicio de sesión (email/Google) para páginas de auth.
- `auth-guard.js`: Redirección a login si no hay sesión.
- `dashboard-data.js`: Pinta datos básicos del usuario en dashboard.
- `profile.js`: Carga/guarda datos de perfil, foto y contraseña.
- `theme-toggle.js`: Alterna tema en dashboard.

## Recursos de Firebase
- `firebase.js`: Configuración y exports de auth/database/storage/firestore.
- `firebase-config.js`: Configuración consumida en scripts con SDK 9.6.1 (maindashboard).
- `database.rules.json`: Reglas del Realtime Database.

## Activos
- Logos: `imagotipo_tamoe.png`, `logotipo_tamoe.png`.
- Estilos: Tailwind CDN por página; sin build pipeline.
