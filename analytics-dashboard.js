import { auth, database } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import {
    calculateGeneralStats,
    calculateOverdueTasks,
    calculateUpcomingDeadlines,
    calculateWorkloadBalance,
    formatStatusChartData,
    formatPriorityChartData,
    formatProductivityChartData,
    formatUserWorkloadChartData,
    formatClientComparisonChartData,
    formatProjectStatusChartData
} from './src/analytics/analytics-service.js';

document.addEventListener('DOMContentLoaded', () => {
    const tabButton = document.getElementById('tab-analytics');
    const panel = document.getElementById('tab-panel-analytics');
    if (!tabButton || !panel) return;

    const loadingEl = document.getElementById('analytics-loading');
    const contentEl = document.getElementById('analytics-content');
    const refreshBtn = document.getElementById('analytics-refresh-btn');
    const themeToggle = document.getElementById('theme-toggle');

    let clients = [];
    let usersByUid = {};
    let clientsReady = false;
    let usersReady = false;
    let listenersAttached = false;
    let dataSubscribed = false;
    let charts = {};

    const isPanelVisible = () => !panel.classList.contains('hidden');

    const setLoading = (isLoading) => {
        if (loadingEl) loadingEl.classList.toggle('hidden', !isLoading);
        if (contentEl) contentEl.classList.toggle('hidden', isLoading);
    };

    const ensureListeners = () => {
        if (listenersAttached) return;
        listenersAttached = true;
        setLoading(true);

        onAuthStateChanged(auth, (user) => {
            if (!user) return;
            attachDataListeners();
        });
    };

    const attachDataListeners = () => {
        if (dataSubscribed) return;
        dataSubscribed = true;

        const clientsRef = ref(database, 'clients');
        const usersRef = ref(database, 'users');

        onValue(clientsRef, (snapshot) => {
            const data = snapshot.val() || {};
            clients = Object.entries(data).map(([clientId, client]) => ({
                clientId,
                ...client
            }));
            clientsReady = true;
            maybeRender();
        });

        onValue(usersRef, (snapshot) => {
            usersByUid = snapshot.val() || {};
            usersReady = true;
            maybeRender();
        });
    };

    const maybeRender = () => {
        if (!clientsReady || !usersReady) {
            if (isPanelVisible()) setLoading(true);
            return;
        }
        renderAnalytics();
    };

    const renderAnalytics = () => {
        if (!isPanelVisible()) return;
        setLoading(false);

        const stats = calculateGeneralStats(clients);
        updateStats(stats);
        updateCharts(clients, usersByUid, stats.completionRate);
        updateTables(clients, usersByUid);
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const updateStats = (stats) => {
        setText('stat-clients', stats.totalClients);
        setText('stat-projects', stats.totalProjects);
        setText('stat-products', stats.totalProducts);
        setText('stat-tasks', stats.totalTasks);
        setText('stat-pending', stats.pendingTasks);
        setText('stat-completion', `${stats.completionRate}%`);
    };

    const getChartTextColor = () => (
        document.documentElement.classList.contains('dark') ? '#e0b9d2' : '#6a3f59'
    );

    const updateCharts = (clientsData, usersData, completionRate) => {
        updateGauge(completionRate);

        const ChartCtor = window.Chart;
        if (!ChartCtor) return;

        const textColor = getChartTextColor();

        Object.values(charts).forEach((chart) => chart?.destroy());
        charts = {};

        const statusCanvas = document.getElementById('chart-status');
        if (statusCanvas) {
            charts.status = new ChartCtor(statusCanvas, {
                type: 'doughnut',
                data: formatStatusChartData(clientsData),
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor } }
                    }
                }
            });
        }

        const priorityCanvas = document.getElementById('chart-priority');
        if (priorityCanvas) {
            charts.priority = new ChartCtor(priorityCanvas, {
                type: 'doughnut',
                data: formatPriorityChartData(clientsData),
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor } }
                    }
                }
            });
        }

        const activityCanvas = document.getElementById('chart-activity');
        if (activityCanvas) {
            charts.activity = new ChartCtor(activityCanvas, {
                type: 'line',
                data: formatProductivityChartData(clientsData),
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { color: textColor } },
                        x: { ticks: { color: textColor, maxTicksLimit: 10 } }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { color: textColor } }
                    }
                }
            });
        }

        const workloadCanvas = document.getElementById('chart-workload');
        if (workloadCanvas) {
            charts.workload = new ChartCtor(workloadCanvas, {
                type: 'bar',
                data: formatUserWorkloadChartData(clientsData, usersData),
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    scales: {
                        x: { stacked: true, ticks: { color: textColor } },
                        y: { stacked: true, ticks: { color: textColor } }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { color: textColor } }
                    }
                }
            });
        }

        const clientsCanvas = document.getElementById('chart-clients');
        if (clientsCanvas) {
            charts.clients = new ChartCtor(clientsCanvas, {
                type: 'bar',
                data: formatClientComparisonChartData(clientsData),
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { color: textColor } },
                        x: { ticks: { color: textColor } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        const projectsCanvas = document.getElementById('chart-projects');
        if (projectsCanvas) {
            charts.projects = new ChartCtor(projectsCanvas, {
                type: 'bar',
                data: formatProjectStatusChartData(clientsData),
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { color: textColor } },
                        x: { ticks: { color: textColor } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }
    };

    const updateGauge = (value) => {
        const canvas = document.getElementById('chart-gauge');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const isDark = document.documentElement.classList.contains('dark');
        const trackColor = isDark ? '#4a3242' : '#e5e7eb';
        const startColor = '#e619a1';
        const endColor = '#c9168d';
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 70;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 0.25 * Math.PI);
        ctx.strokeStyle = trackColor;
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        ctx.stroke();

        const endAngle = 0.75 * Math.PI + (1.5 * Math.PI * value / 100);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, endAngle);
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        ctx.stroke();

        setText('gauge-value', `${value}%`);
    };

    const updateTables = (clientsData, usersData) => {
        const overdueTasks = calculateOverdueTasks(clientsData);
        const overdueTable = document.getElementById('table-overdue');
        const noOverdue = document.getElementById('no-overdue');

        if (overdueTable && noOverdue) {
            if (overdueTasks.length === 0) {
                overdueTable.innerHTML = '';
                noOverdue.classList.remove('hidden');
            } else {
                noOverdue.classList.add('hidden');
                overdueTable.innerHTML = overdueTasks.slice(0, 10).map(task => `
                    <tr class="hover:bg-gray-100 dark:hover:bg-white/5">
                        <td class="px-3 py-2 text-gray-900 dark:text-white font-medium">${escapeHtml(task.name)}</td>
                        <td class="px-3 py-2 text-text-muted text-xs">${escapeHtml(task.path)}</td>
                        <td class="px-3 py-2 text-center">
                            <span class="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                                ${task.daysOverdue} dias
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }

        const upcomingTasks = calculateUpcomingDeadlines(clientsData);
        const upcomingTable = document.getElementById('table-upcoming');
        const noUpcoming = document.getElementById('no-upcoming');

        if (upcomingTable && noUpcoming) {
            if (upcomingTasks.length === 0) {
                upcomingTable.innerHTML = '';
                noUpcoming.classList.remove('hidden');
            } else {
                noUpcoming.classList.add('hidden');
                upcomingTable.innerHTML = upcomingTasks.slice(0, 10).map(task => `
                    <tr class="hover:bg-gray-100 dark:hover:bg-white/5">
                        <td class="px-3 py-2 text-gray-900 dark:text-white font-medium">${escapeHtml(task.name)}</td>
                        <td class="px-3 py-2 text-text-muted text-xs">${escapeHtml(task.path)}</td>
                        <td class="px-3 py-2 text-center">
                            <span class="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                                ${task.isToday ? 'Hoy' : task.isTomorrow ? 'Manana' : `${task.daysUntilDue} dias`}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }

        const workload = calculateWorkloadBalance(clientsData, usersData);
        setText('workload-avg', workload.average);
        setText('workload-max', workload.max);
        setText('workload-min', workload.min);

        const overloadedContainer = document.getElementById('overloaded-users');
        const noOverloaded = document.getElementById('no-overloaded');
        if (overloadedContainer && noOverloaded) {
            if (workload.overloaded.length > 0) {
                noOverloaded.classList.add('hidden');
                overloadedContainer.innerHTML = workload.overloaded.map(user => `
                    <div class="flex items-center justify-between rounded-lg border border-border-dark bg-white dark:bg-surface-dark px-3 py-2">
                        <span class="text-gray-900 dark:text-white text-sm">${escapeHtml(user.username)}</span>
                        <span class="text-text-muted text-xs">${user.activeTasks} tareas activas</span>
                    </div>
                `).join('');
            } else {
                noOverloaded.classList.remove('hidden');
                overloadedContainer.innerHTML = '';
            }
        }

        const underloadedContainer = document.getElementById('underloaded-users');
        const noUnderloaded = document.getElementById('no-underloaded');
        if (underloadedContainer && noUnderloaded) {
            if (workload.underloaded.length > 0) {
                noUnderloaded.classList.add('hidden');
                underloadedContainer.innerHTML = workload.underloaded.map(user => `
                    <div class="flex items-center justify-between rounded-lg border border-border-dark bg-white dark:bg-surface-dark px-3 py-2">
                        <span class="text-gray-900 dark:text-white text-sm">${escapeHtml(user.username)}</span>
                        <span class="text-text-muted text-xs">${user.activeTasks} tareas activas</span>
                    </div>
                `).join('');
            } else {
                noUnderloaded.classList.remove('hidden');
                underloadedContainer.innerHTML = '';
            }
        }
    };

    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    tabButton.addEventListener('click', () => {
        ensureListeners();
        maybeRender();
    });

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (!clientsReady || !usersReady) {
                setLoading(true);
                return;
            }
            renderAnalytics();
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            if (!clientsReady || !usersReady) return;
            renderAnalytics();
        });
    }

    if (isPanelVisible()) {
        ensureListeners();
    }
});
