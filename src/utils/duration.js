/**
 * Utilidades para manejo de duración (tiempo estimado, horas empleadas, etc.)
 * Almacenamiento estándar: minutos (number)
 * Formato de entrada: "1h 30m", "2h", "45m", "90m", "1:30", etc.
 */

/**
 * Parsea una cadena de duración a minutos totales
 * @param {string} input - Cadena de entrada (ej: "1h 30m", "2h", "45m", "90m", "1:30")
 * @returns {number|null} - Minutos totales o null si el formato es inválido
 *
 * Formatos aceptados:
 * - "1h 30m" => 90
 * - "2h" => 120
 * - "45m" => 45
 * - "90m" => 90
 * - "1:30" => 90
 * - "1h30m" (sin espacio) => 90
 */
export function parseDurationToMinutes(input) {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return null;

    // Patrón para formato "1h 30m" o "1h30m"
    const hmPattern = /^(\d+)\s*h\s*(\d+)\s*m$/;
    const hmMatch = trimmed.match(hmPattern);
    if (hmMatch) {
        const hours = parseInt(hmMatch[1], 10);
        const minutes = parseInt(hmMatch[2], 10);
        return hours * 60 + minutes;
    }

    // Patrón para solo horas "2h"
    const hPattern = /^(\d+)\s*h$/;
    const hMatch = trimmed.match(hPattern);
    if (hMatch) {
        return parseInt(hMatch[1], 10) * 60;
    }

    // Patrón para solo minutos "45m"
    const mPattern = /^(\d+)\s*m$/;
    const mMatch = trimmed.match(mPattern);
    if (mMatch) {
        return parseInt(mMatch[1], 10);
    }

    // Patrón para formato "1:30" (horas:minutos)
    const colonPattern = /^(\d+):(\d+)$/;
    const colonMatch = trimmed.match(colonPattern);
    if (colonMatch) {
        const hours = parseInt(colonMatch[1], 10);
        const minutes = parseInt(colonMatch[2], 10);
        return hours * 60 + minutes;
    }

    // Si solo es un número, asumimos que son minutos
    const numPattern = /^(\d+)$/;
    const numMatch = trimmed.match(numPattern);
    if (numMatch) {
        return parseInt(numMatch[1], 10);
    }

    return null;
}

/**
 * Formatea minutos a una cadena legible
 * @param {number} totalMinutes - Minutos totales
 * @returns {string} - Cadena formateada (ej: "1h 30m", "2h", "45m")
 */
export function formatMinutesToDuration(totalMinutes) {
    if (totalMinutes == null || isNaN(totalMinutes)) return '';

    const mins = Math.max(0, Math.round(totalMinutes));

    if (mins === 0) return '0m';

    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;

    if (hours === 0) {
        return `${minutes}m`;
    }

    if (minutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${minutes}m`;
}

/**
 * Crea un input de duración reutilizable con validación y formato automático
 * @param {Object} options - Opciones de configuración
 * @param {number} options.valueMinutes - Valor inicial en minutos
 * @param {string} options.placeholder - Placeholder del input (default: "Ej: 1h 30m")
 * @param {Function} options.onCommit - Callback llamado cuando se confirma un valor válido (recibe minutos)
 * @param {string} options.className - Clases CSS adicionales para el input
 * @param {boolean} options.disabled - Si el input está deshabilitado
 * @returns {HTMLInputElement} - Elemento input configurado
 */
export function createDurationInput({
    valueMinutes = 0,
    placeholder = 'Ej: 1h 30m',
    onCommit = () => {},
    className = '',
    disabled = false
} = {}) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = `bg-background dark:bg-surface-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-sm text-center ${className}`.trim();
    input.disabled = disabled;

    // Estado interno
    let lastValidMinutes = valueMinutes;

    // Mostrar valor formateado inicial
    if (valueMinutes > 0) {
        input.value = formatMinutesToDuration(valueMinutes);
    }

    // Función para marcar error
    const showError = () => {
        input.classList.add('border-red-500', 'bg-red-50', 'dark:bg-red-900/20');
        input.title = 'Formato inválido. Usa: 1h 30m, 2h, 45m, etc.';
    };

    // Función para quitar error
    const clearError = () => {
        input.classList.remove('border-red-500', 'bg-red-50', 'dark:bg-red-900/20');
        input.title = '';
    };

    // Handler para cuando se confirma el valor (blur o Enter)
    const handleCommit = () => {
        const parsed = parseDurationToMinutes(input.value);

        if (parsed !== null) {
            // Válido: formatear y guardar
            clearError();
            lastValidMinutes = parsed;
            input.value = formatMinutesToDuration(parsed);
            onCommit(parsed);
        } else if (!input.value.trim()) {
            // Vacío: interpretar como 0
            clearError();
            lastValidMinutes = 0;
            input.value = '';
            onCommit(0);
        } else {
            // Inválido: mostrar error y revertir
            showError();
            // No llamar onCommit, mantener el último valor válido
            setTimeout(() => {
                input.value = formatMinutesToDuration(lastValidMinutes);
                clearError();
            }, 1500); // Mostrar error por 1.5s antes de revertir
        }
    };

    // Event listeners
    input.addEventListener('blur', handleCommit);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCommit();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            input.value = formatMinutesToDuration(lastValidMinutes);
            clearError();
            input.blur();
        }
    });

    // Método público para actualizar el valor programáticamente
    input.setDurationValue = (minutes) => {
        lastValidMinutes = minutes;
        input.value = formatMinutesToDuration(minutes);
        clearError();
    };

    return input;
}

/**
 * Convierte horas (decimal) a minutos
 * Útil para migrar desde campos legacy que usan horas decimales
 * @param {number} hours - Horas en formato decimal (ej: 1.5)
 * @returns {number} - Minutos totales
 */
export function hoursToMinutes(hours) {
    if (hours == null || isNaN(hours)) return 0;
    return Math.round(parseFloat(hours) * 60);
}

/**
 * Convierte minutos a horas (decimal)
 * Útil para compatibilidad con sistemas que esperan horas
 * @param {number} minutes - Minutos totales
 * @returns {number} - Horas en formato decimal
 */
export function minutesToHours(minutes) {
    if (minutes == null || isNaN(minutes)) return 0;
    return parseFloat(minutes) / 60;
}
