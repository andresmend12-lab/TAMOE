/**
 * Timeline Module - Gantt-like view for task scheduling
 */

import { extractAllTasks } from '../analytics/analytics-service.js';

// ============================================
// CONSTANTS
// ============================================

const DAYS_TO_SHOW = 21; // 3 weeks
const DAY_WIDTH = 40; // pixels per day
const ROW_HEIGHT = 36; // pixels per row

const STATUS_COLORS = {
  'Pendiente': '#FBBF24',
  'En proceso': '#3B82F6',
  'Finalizado': '#10B981'
};

// ============================================
// TIMELINE CLASS
// ============================================

export class Timeline {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.tasks = [];
    this.clients = [];
    this.usersByUid = {};
    this.startDate = this.getStartOfWeek(new Date());
    this.filters = {
      clientId: null,
      status: null
    };

    if (this.container) {
      this.render();
    }
  }

  /**
   * Get start of week (Monday)
   */
  getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Set data and refresh
   */
  setData(clients, usersByUid = {}) {
    this.clients = clients || [];
    this.usersByUid = usersByUid;
    this.tasks = this.getFilteredTasks();
    this.render();
  }

  /**
   * Get filtered tasks with due dates
   */
  getFilteredTasks() {
    let tasks = extractAllTasks(this.clients).filter(t => t.dueDate);

    if (this.filters.clientId) {
      tasks = tasks.filter(t => t.clientId === this.filters.clientId);
    }

    if (this.filters.status) {
      tasks = tasks.filter(t => t.status === this.filters.status);
    }

    return tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  /**
   * Set filter
   */
  setFilter(key, value) {
    this.filters[key] = value || null;
    this.tasks = this.getFilteredTasks();
    this.render();
  }

  /**
   * Navigate to previous period
   */
  previous() {
    this.startDate.setDate(this.startDate.getDate() - 7);
    this.render();
  }

  /**
   * Navigate to next period
   */
  next() {
    this.startDate.setDate(this.startDate.getDate() + 7);
    this.render();
  }

  /**
   * Go to today
   */
  today() {
    this.startDate = this.getStartOfWeek(new Date());
    this.render();
  }

  /**
   * Generate array of dates for the timeline
   */
  getDates() {
    const dates = [];
    const current = new Date(this.startDate);

    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Check if date is today
   */
  isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  /**
   * Check if date is weekend
   */
  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  /**
   * Check if task is overdue
   */
  isOverdue(task) {
    if (task.status === 'Finalizado') return false;
    const dueDate = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  /**
   * Get position for a task on the timeline
   */
  getTaskPosition(task) {
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    const startTime = this.startDate.getTime();
    const endTime = new Date(this.startDate);
    endTime.setDate(endTime.getDate() + DAYS_TO_SHOW);

    // Check if task is visible in current view
    if (dueDate < this.startDate || dueDate >= endTime) {
      return null;
    }

    const daysDiff = Math.floor((dueDate - startTime) / (1000 * 60 * 60 * 24));
    return daysDiff * DAY_WIDTH;
  }

  /**
   * Render the timeline
   */
  render() {
    if (!this.container) return;

    const dates = this.getDates();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's position
    let todayPosition = null;
    dates.forEach((date, index) => {
      if (this.isToday(date)) {
        todayPosition = index * DAY_WIDTH + (DAY_WIDTH / 2);
      }
    });

    this.container.innerHTML = `
      <div class="timeline-wrapper">
        <!-- Controls -->
        <div class="timeline-controls flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2">
            <button id="timeline-prev" class="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-sm">
              ◀ Anterior
            </button>
            <button id="timeline-today" class="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
              Hoy
            </button>
            <button id="timeline-next" class="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-sm">
              Siguiente ▶
            </button>
          </div>

          <div class="flex items-center gap-3">
            <!-- Client filter -->
            <select id="timeline-client-filter" class="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm">
              <option value="">Todos los clientes</option>
              ${this.clients.map(c => `
                <option value="${c.clientId}" ${this.filters.clientId === c.clientId ? 'selected' : ''}>
                  ${this.escapeHtml(c.name)}
                </option>
              `).join('')}
            </select>

            <!-- Status filter -->
            <select id="timeline-status-filter" class="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm">
              <option value="">Todos los estados</option>
              <option value="Pendiente" ${this.filters.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="En proceso" ${this.filters.status === 'En proceso' ? 'selected' : ''}>En proceso</option>
              <option value="Finalizado" ${this.filters.status === 'Finalizado' ? 'selected' : ''}>Finalizado</option>
            </select>
          </div>
        </div>

        <!-- Timeline header with dates -->
        <div class="timeline-header-container overflow-x-auto">
          <div class="timeline-header flex border-b border-gray-200 dark:border-gray-700" style="width: ${DAYS_TO_SHOW * DAY_WIDTH}px;">
            ${dates.map(date => `
              <div class="timeline-day-header flex-shrink-0 text-center py-2 text-xs border-r border-gray-200 dark:border-gray-700
                ${this.isToday(date) ? 'bg-blue-100 dark:bg-blue-900 font-bold' : ''}
                ${this.isWeekend(date) ? 'bg-gray-100 dark:bg-gray-800' : ''}"
                style="width: ${DAY_WIDTH}px;">
                <div class="text-gray-500 dark:text-gray-400">
                  ${date.toLocaleDateString('es-ES', { weekday: 'short' })}
                </div>
                <div class="${this.isToday(date) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}">
                  ${date.getDate()}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Timeline body with tasks -->
        <div class="timeline-body-container overflow-x-auto overflow-y-auto max-h-96">
          <div class="timeline-body relative" style="width: ${DAYS_TO_SHOW * DAY_WIDTH}px; min-height: ${Math.max(this.tasks.length * ROW_HEIGHT, 100)}px;">
            <!-- Grid columns -->
            <div class="absolute inset-0 flex pointer-events-none">
              ${dates.map(date => `
                <div class="flex-shrink-0 h-full border-r border-gray-100 dark:border-gray-800
                  ${this.isWeekend(date) ? 'bg-gray-50 dark:bg-gray-900/50' : ''}"
                  style="width: ${DAY_WIDTH}px;">
                </div>
              `).join('')}
            </div>

            <!-- Today line -->
            ${todayPosition !== null ? `
              <div class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style="left: ${todayPosition}px;"></div>
            ` : ''}

            <!-- Tasks -->
            ${this.tasks.length === 0 ? `
              <div class="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
                No hay tareas con fecha de vencimiento en este período
              </div>
            ` : this.tasks.map((task, index) => {
              const position = this.getTaskPosition(task);
              if (position === null) return '';

              const isOverdue = this.isOverdue(task);
              const color = isOverdue ? '#EF4444' : STATUS_COLORS[task.status] || '#6B7280';
              const user = this.usersByUid[task.assigneeUid];
              const userName = user?.username || 'Sin asignar';

              return `
                <div class="timeline-task absolute flex items-center gap-2 px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 transition-opacity"
                  style="left: ${position}px; top: ${index * ROW_HEIGHT + 4}px; background-color: ${color}; max-width: 200px;"
                  title="${this.escapeHtml(task.name)}&#10;${this.escapeHtml(task.path)}&#10;Asignado: ${this.escapeHtml(userName)}&#10;Vence: ${new Date(task.dueDate).toLocaleDateString('es-ES')}${isOverdue ? '&#10;⚠️ VENCIDA' : ''}">
                  <span class="truncate">${this.escapeHtml(task.name)}</span>
                  ${isOverdue ? '<span class="flex-shrink-0">⚠️</span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Legend -->
        <div class="timeline-legend flex items-center gap-4 mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
          <span class="text-gray-600 dark:text-gray-400">Leyenda:</span>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded" style="background-color: #FBBF24;"></span>
            <span>Pendiente</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded" style="background-color: #3B82F6;"></span>
            <span>En proceso</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded" style="background-color: #10B981;"></span>
            <span>Finalizado</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded" style="background-color: #EF4444;"></span>
            <span>Vencido</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const prevBtn = document.getElementById('timeline-prev');
    const nextBtn = document.getElementById('timeline-next');
    const todayBtn = document.getElementById('timeline-today');
    const clientFilter = document.getElementById('timeline-client-filter');
    const statusFilter = document.getElementById('timeline-status-filter');

    prevBtn?.addEventListener('click', () => this.previous());
    nextBtn?.addEventListener('click', () => this.next());
    todayBtn?.addEventListener('click', () => this.today());

    clientFilter?.addEventListener('change', (e) => {
      this.setFilter('clientId', e.target.value);
    });

    statusFilter?.addEventListener('change', (e) => {
      this.setFilter('status', e.target.value);
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create and initialize a timeline
 * @param {string} containerId - Container element ID
 * @returns {Timeline} Timeline instance
 */
export const createTimeline = (containerId) => {
  return new Timeline(containerId);
};
