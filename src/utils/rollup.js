/**
 * Utilidades para el sistema de rollup jerárquico de tiempo estimado
 * Soporta la propagación automática desde subtareas → tareas → productos → proyectos
 */

import { database } from '../../firebase.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

/**
 * Función genérica para recomputar y actualizar el rollup de tiempo estimado jerárquico
 * Suma el (estimatedMinutes + estimatedMinutesRollup) de todos los hijos y guarda en estimatedMinutesRollup del padre
 * @param {string} parentDbPath - Path RTDB del nodo padre (ej: "clients/x/projects/y/tasks/z")
 * @param {string} childrenKey - Clave de los hijos (ej: "subtasks", "tasks", "products", "projects")
 * @returns {Promise<number>} - Total de minutos rollup
 */
export async function recomputeRollup(parentDbPath, childrenKey) {
    if (!parentDbPath || typeof parentDbPath !== 'string') {
        console.warn('recomputeRollup: parentDbPath inválido', parentDbPath);
        return 0;
    }
    if (!childrenKey || typeof childrenKey !== 'string') {
        console.warn('recomputeRollup: childrenKey inválido', childrenKey);
        return 0;
    }

    try {
        // Leer el nodo padre
        const parentSnap = await get(ref(database, parentDbPath));
        if (!parentSnap.exists()) {
            console.warn('recomputeRollup: nodo padre no encontrado', parentDbPath);
            return 0;
        }

        const parentData = parentSnap.val();
        const children = parentData[childrenKey] || {};

        // Sumar (estimatedMinutes + estimatedMinutesRollup) de cada hijo
        let rollupSum = 0;
        Object.values(children).forEach(child => {
            if (!child) return;

            // Manual del hijo
            const childManual = Number(child.estimatedMinutes) || 0;
            // Rollup del hijo (si tiene hijos propios)
            const childRollup = Number(child.estimatedMinutesRollup) || 0;

            rollupSum += childManual + childRollup;
        });

        // Guardar en el padre (NO sobrescribe estimatedMinutes manual del padre)
        await update(ref(database, parentDbPath), {
            estimatedMinutesRollup: rollupSum,
            updatedAt: new Date().toISOString()
        });

        console.log(`✓ Rollup actualizado para ${parentDbPath} (${childrenKey}): ${rollupSum} min`);
        return rollupSum;
    } catch (error) {
        console.error('Error al recomputar rollup:', {
            error,
            parentDbPath,
            childrenKey
        });
        throw error;
    }
}

/**
 * Propaga el rollup de tiempo estimado hacia arriba en toda la jerarquía
 * Detecta automáticamente el tipo de nodo según el path y propaga hacia arriba
 *
 * Jerarquía soportada:
 * - Subtarea → Tarea → Producto → Proyecto
 * - Subtarea → Tarea → Proyecto (sin producto)
 * - Tarea → Producto → Proyecto
 * - Tarea → Proyecto (sin producto)
 * - Producto → Proyecto
 *
 * @param {string} itemPath - Path RTDB del item que cambió (ej: "clients/x/projects/y/products/z/tasks/w/subtasks/q")
 * @returns {Promise<void>}
 */
export async function propagateRollupHierarchy(itemPath) {
    if (!itemPath || typeof itemPath !== 'string') {
        console.warn('propagateRollupHierarchy: itemPath inválido', itemPath);
        return;
    }

    try {
        const parts = itemPath.split('/');

        // Detectar tipo de nodo según el path
        // Formato: clients/{cId}/projects/{pId}/[products/{prId}/]tasks/{tId}[/subtasks/{sId}]

        const clientIdx = parts.indexOf('clients');
        const projectIdx = parts.indexOf('projects');
        const productIdx = parts.indexOf('products');
        const taskIdx = parts.indexOf('tasks');
        const subtaskIdx = parts.indexOf('subtasks');

        if (clientIdx === -1 || projectIdx === -1) {
            console.warn('propagateRollupHierarchy: path no contiene client/project', itemPath);
            return;
        }

        const clientId = parts[clientIdx + 1];
        const projectId = parts[projectIdx + 1];
        const productId = productIdx !== -1 ? parts[productIdx + 1] : null;
        const taskId = taskIdx !== -1 ? parts[taskIdx + 1] : null;
        const isSubtask = subtaskIdx !== -1;

        // Construcción de paths
        const projectPath = `clients/${clientId}/projects/${projectId}`;
        const productPath = productId ? `${projectPath}/products/${productId}` : null;
        const taskPath = taskId ? (productPath ? `${productPath}/tasks/${taskId}` : `${projectPath}/tasks/${taskId}`) : null;

        console.log('🔄 Propagando rollup desde:', { itemPath, isSubtask, taskId, productId, projectId });

        // CASCADA DE ROLLUPS (siempre hacia arriba, nunca hacia abajo)

        if (isSubtask && taskPath) {
            // Subtarea → Tarea
            await recomputeRollup(taskPath, 'subtasks');
            console.log('  ✓ Tarea actualizada');
        }

        if (taskPath && productPath) {
            // Tarea → Producto
            await recomputeRollup(productPath, 'tasks');
            console.log('  ✓ Producto actualizado');
        } else if (taskPath && !productPath) {
            // Tarea sin producto → Proyecto
            await recomputeRollup(projectPath, 'tasks');
            console.log('  ✓ Proyecto actualizado (desde tarea sin producto)');
        }

        if (productPath) {
            // Producto → Proyecto
            await recomputeRollup(projectPath, 'products');
            console.log('  ✓ Proyecto actualizado (desde producto)');
        }

        console.log('✅ Rollup propagado completamente');
    } catch (error) {
        console.error('❌ Error al propagar rollup:', {
            error,
            itemPath
        });
        // No lanzar el error para no bloquear el guardado original
    }
}
