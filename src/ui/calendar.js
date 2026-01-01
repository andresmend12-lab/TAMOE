/**
 * Calendar Module - Calendar view functionality
 */

import { store } from '../state/store.js';
import { showEl, hideEl, getEl, isToday, startOfDay, escapeHtml } from '../utils/helpers.js';

// ============================================
// CONSTANTS
// ============================================

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ============================================
// CALENDAR STATE
// ============================================

let calendarElements = null;
let selectedDate = null;

/**
 * Initialize calendar elements
 * @param {Object} elements - DOM element references
 */
export const initCalendar = (elements) => {
  calendarElements = {
    viewLabel: elements.viewLabel || getEl('calendar-view-label'),
    monthLabel: elements.monthLabel || getEl('calendar-month'),
    weekdays: elements.weekdays || getEl('calendar-weekdays'),
    grid: elements.grid || getEl('calendar-grid'),
    dayList: elements.dayList || getEl('calendar-day-list'),
    empty: elements.empty || getEl('calendar-empty'),
    prevBtn: elements.prevBtn || getEl('calendar-prev'),
    nextBtn: elements.nextBtn || getEl('calendar-next'),
    todayBtn: elements.todayBtn || getEl('calendar-today'),
    viewButtons: elements.viewButtons || []
  };

  // Setup event listeners
  setupEventListeners();

  // Subscribe to store changes
  store.subscribe((state) => {
    render();
  }, ['calendarState', 'calendarItems']);
};

/**
 * Setup calendar event listeners
 */
const setupEventListeners = () => {
  if (!calendarElements) return;

  if (calendarElements.prevBtn) {
    calendarElements.prevBtn.addEventListener('click', navigatePrev);
  }

  if (calendarElements.nextBtn) {
    calendarElements.nextBtn.addEventListener('click', navigateNext);
  }

  if (calendarElements.todayBtn) {
    calendarElements.todayBtn.addEventListener('click', goToToday);
  }

  calendarElements.viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.calendarView;
      if (view) setView(view);
    });
  });
};

// ============================================
// NAVIGATION
// ============================================

/**
 * Navigate to previous period
 */
export const navigatePrev = () => {
  const state = store.get('calendarState');
  const date = new Date(state.date);

  switch (state.view) {
    case 'month':
      date.setMonth(date.getMonth() - 1);
      break;
    case 'week':
      date.setDate(date.getDate() - 7);
      break;
    case 'day':
      date.setDate(date.getDate() - 1);
      break;
  }

  store.setKey('calendarState', { ...state, date });
};

/**
 * Navigate to next period
 */
export const navigateNext = () => {
  const state = store.get('calendarState');
  const date = new Date(state.date);

  switch (state.view) {
    case 'month':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'week':
      date.setDate(date.getDate() + 7);
      break;
    case 'day':
      date.setDate(date.getDate() + 1);
      break;
  }

  store.setKey('calendarState', { ...state, date });
};

/**
 * Go to today
 */
export const goToToday = () => {
  const state = store.get('calendarState');
  store.setKey('calendarState', { ...state, date: new Date() });
};

/**
 * Set calendar view
 * @param {string} view - 'month', 'week', 'day'
 */
export const setView = (view) => {
  const state = store.get('calendarState');
  store.setKey('calendarState', { ...state, view });

  // Update view buttons
  calendarElements.viewButtons.forEach(btn => {
    const isActive = btn.dataset.calendarView === view;
    btn.classList.toggle('bg-blue-100', isActive);
    btn.classList.toggle('dark:bg-blue-900', isActive);
    btn.classList.toggle('text-blue-700', isActive);
    btn.classList.toggle('dark:text-blue-200', isActive);
  });
};

/**
 * Select a date
 * @param {Date} date
 */
export const selectDate = (date) => {
  selectedDate = date;
  render();
};

// ============================================
// RENDERING
// ============================================

/**
 * Render calendar based on current state
 */
export const render = () => {
  if (!calendarElements) return;

  const state = store.get('calendarState');
  const items = store.get('calendarItems') || [];

  // Update month label
  if (calendarElements.monthLabel) {
    calendarElements.monthLabel.textContent = formatMonthLabel(state.date, state.view);
  }

  // Update view label
  if (calendarElements.viewLabel) {
    calendarElements.viewLabel.textContent = getViewLabel(state.view);
  }

  // Render based on view
  switch (state.view) {
    case 'month':
      renderMonthView(state.date, items);
      break;
    case 'week':
      renderWeekView(state.date, items);
      break;
    case 'day':
      renderDayView(state.date, items);
      break;
  }
};

/**
 * Render month view
 * @param {Date} date
 * @param {Object[]} items
 */
const renderMonthView = (date, items) => {
  if (!calendarElements.grid) return;

  const year = date.getFullYear();
  const month = date.getMonth();

  // Get first day of month and total days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // Get starting weekday (0 = Sunday, adjust for Monday start)
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  // Build grid
  const cells = [];

  // Empty cells before first day
  for (let i = 0; i < startWeekday; i++) {
    cells.push('<div class="p-1 min-h-[60px]"></div>');
  }

  // Day cells
  for (let day = 1; day <= totalDays; day++) {
    const cellDate = new Date(year, month, day);
    const dayItems = getItemsForDate(items, cellDate);
    const isTodayCell = isToday(cellDate);
    const isSelected = selectedDate && cellDate.toDateString() === selectedDate.toDateString();

    cells.push(`
      <div class="p-1 min-h-[60px] border border-gray-100 dark:border-gray-700 rounded-lg
        ${isTodayCell ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
        ${isSelected ? 'ring-2 ring-blue-500' : ''}
        hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
        data-calendar-date="${cellDate.toISOString()}"
      >
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium ${isTodayCell ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}">
            ${day}
          </span>
          ${dayItems.length > 0 ? `<span class="text-xs text-gray-500">${dayItems.length}</span>` : ''}
        </div>
        <div class="space-y-0.5">
          ${dayItems.slice(0, 2).map(item => renderCalendarItem(item, true)).join('')}
          ${dayItems.length > 2 ? `<div class="text-xs text-gray-500">+${dayItems.length - 2} más</div>` : ''}
        </div>
      </div>
    `);
  }

  // Render weekday headers
  if (calendarElements.weekdays) {
    calendarElements.weekdays.innerHTML = WEEKDAYS.map(day =>
      `<div class="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">${day}</div>`
    ).join('');
  }

  calendarElements.grid.innerHTML = cells.join('');
  showEl(calendarElements.grid);
  hideEl(calendarElements.dayList);

  // Add click handlers
  calendarElements.grid.querySelectorAll('[data-calendar-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const dateStr = cell.dataset.calendarDate;
      selectDate(new Date(dateStr));
    });
  });
};

/**
 * Render week view
 * @param {Date} date
 * @param {Object[]} items
 */
const renderWeekView = (date, items) => {
  if (!calendarElements.grid) return;

  // Get start of week (Monday)
  const weekStart = new Date(date);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + diff);

  const cells = [];

  // Render weekday headers
  if (calendarElements.weekdays) {
    const headers = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const isTodayCell = isToday(d);
      headers.push(`
        <div class="text-center py-2">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400">${WEEKDAYS[i]}</div>
          <div class="text-lg font-semibold ${isTodayCell ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}">
            ${d.getDate()}
          </div>
        </div>
      `);
    }
    calendarElements.weekdays.innerHTML = headers.join('');
  }

  // Day columns
  for (let i = 0; i < 7; i++) {
    const cellDate = new Date(weekStart);
    cellDate.setDate(cellDate.getDate() + i);
    const dayItems = getItemsForDate(items, cellDate);
    const isTodayCell = isToday(cellDate);

    cells.push(`
      <div class="p-2 min-h-[200px] border-r border-gray-100 dark:border-gray-700 last:border-r-0
        ${isTodayCell ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}"
        data-calendar-date="${cellDate.toISOString()}"
      >
        <div class="space-y-1">
          ${dayItems.map(item => renderCalendarItem(item, false)).join('')}
          ${dayItems.length === 0 ? '<div class="text-xs text-gray-400 text-center py-4">Sin tareas</div>' : ''}
        </div>
      </div>
    `);
  }

  calendarElements.grid.innerHTML = `<div class="grid grid-cols-7">${cells.join('')}</div>`;
  showEl(calendarElements.grid);
  hideEl(calendarElements.dayList);
};

/**
 * Render day view
 * @param {Date} date
 * @param {Object[]} items
 */
const renderDayView = (date, items) => {
  if (!calendarElements.dayList) return;

  const dayItems = getItemsForDate(items, date);

  if (dayItems.length === 0) {
    hideEl(calendarElements.dayList);
    showEl(calendarElements.empty);
    if (calendarElements.empty) {
      calendarElements.empty.textContent = 'No hay tareas para este día';
    }
    return;
  }

  hideEl(calendarElements.empty);
  hideEl(calendarElements.grid);
  showEl(calendarElements.dayList);

  calendarElements.dayList.innerHTML = dayItems.map(item => `
    <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
      data-item-id="${item.id}"
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-gray-500">${escapeHtml(item.manageId || '')}</span>
            <span class="px-2 py-0.5 text-xs rounded-full ${getStatusClass(item.status)}">
              ${escapeHtml(item.status || 'Pendiente')}
            </span>
          </div>
          <h4 class="font-medium text-gray-900 dark:text-white">${escapeHtml(item.name)}</h4>
          ${item.description ? `<p class="text-sm text-gray-500 mt-1 line-clamp-2">${escapeHtml(item.description)}</p>` : ''}
        </div>
        ${item.assigneeName ? `
          <div class="text-right text-sm text-gray-500">
            <span>${escapeHtml(item.assigneeName)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
};

// ============================================
// HELPERS
// ============================================

/**
 * Get items for a specific date
 * @param {Object[]} items
 * @param {Date} date
 * @returns {Object[]}
 */
const getItemsForDate = (items, date) => {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  return items.filter(item => {
    if (!item.dueDate) return false;
    const itemDate = new Date(item.dueDate).getTime();
    return itemDate >= dayStart && itemDate < dayEnd;
  });
};

/**
 * Format month label based on view
 * @param {Date} date
 * @param {string} view
 * @returns {string}
 */
const formatMonthLabel = (date, view) => {
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();

  if (view === 'day') {
    return `${date.getDate()} de ${month} ${year}`;
  }

  if (view === 'week') {
    const weekStart = new Date(date);
    const dayOfWeek = weekStart.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + diff);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${weekStart.getDate()} - ${weekEnd.getDate()} de ${month} ${year}`;
    } else {
      return `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} - ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]} ${year}`;
    }
  }

  return `${month} ${year}`;
};

/**
 * Get view label
 * @param {string} view
 * @returns {string}
 */
const getViewLabel = (view) => {
  switch (view) {
    case 'month': return 'Mes';
    case 'week': return 'Semana';
    case 'day': return 'Día';
    default: return '';
  }
};

/**
 * Render a calendar item
 * @param {Object} item
 * @param {boolean} compact
 * @returns {string}
 */
const renderCalendarItem = (item, compact = false) => {
  const statusClass = getStatusDotClass(item.status);

  if (compact) {
    return `
      <div class="text-xs truncate flex items-center gap-1" title="${escapeHtml(item.name)}">
        <span class="w-1.5 h-1.5 rounded-full ${statusClass}"></span>
        <span class="truncate">${escapeHtml(item.name)}</span>
      </div>
    `;
  }

  return `
    <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
      <div class="flex items-center gap-1.5 mb-1">
        <span class="w-2 h-2 rounded-full ${statusClass}"></span>
        <span class="text-xs text-gray-500">${escapeHtml(item.manageId || '')}</span>
      </div>
      <div class="font-medium text-gray-900 dark:text-white truncate">${escapeHtml(item.name)}</div>
    </div>
  `;
};

/**
 * Get status dot class
 * @param {string} status
 * @returns {string}
 */
const getStatusDotClass = (status) => {
  switch (status) {
    case 'Pendiente': return 'bg-yellow-500';
    case 'En proceso': return 'bg-blue-500';
    case 'Finalizado': return 'bg-green-500';
    default: return 'bg-gray-400';
  }
};

/**
 * Get status badge class
 * @param {string} status
 * @returns {string}
 */
const getStatusClass = (status) => {
  switch (status) {
    case 'Pendiente':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'En proceso':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'Finalizado':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

// ============================================
// DATA EXTRACTION
// ============================================

/**
 * Extract calendar items from all clients
 * @param {Object[]} clients
 * @param {Object} usersByUid
 * @returns {Object[]}
 */
export const extractCalendarItems = (clients, usersByUid = {}) => {
  const items = [];

  for (const client of clients) {
    if (!client.projects) continue;

    for (const [projectId, project] of Object.entries(client.projects)) {
      // Project-level tasks
      if (project.tasks) {
        for (const [taskId, task] of Object.entries(project.tasks)) {
          if (task.dueDate) {
            items.push({
              id: taskId,
              type: 'task',
              name: task.name,
              status: task.status,
              dueDate: task.dueDate,
              manageId: task.manageId,
              description: task.description,
              assigneeUid: task.assigneeUid,
              assigneeName: usersByUid[task.assigneeUid]?.username || '',
              clientId: client.clientId,
              projectId,
              path: `clients/${client.clientId}/projects/${projectId}/tasks/${taskId}`
            });
          }
        }
      }

      // Product-level tasks
      if (project.products) {
        for (const [productId, product] of Object.entries(project.products)) {
          if (product.tasks) {
            for (const [taskId, task] of Object.entries(product.tasks)) {
              if (task.dueDate) {
                items.push({
                  id: taskId,
                  type: 'task',
                  name: task.name,
                  status: task.status,
                  dueDate: task.dueDate,
                  manageId: task.manageId,
                  description: task.description,
                  assigneeUid: task.assigneeUid,
                  assigneeName: usersByUid[task.assigneeUid]?.username || '',
                  clientId: client.clientId,
                  projectId,
                  productId,
                  path: `clients/${client.clientId}/projects/${projectId}/products/${productId}/tasks/${taskId}`
                });
              }
            }
          }
        }
      }
    }
  }

  return items;
};
