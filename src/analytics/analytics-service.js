/**
 * Analytics Service - Data extraction and calculation functions for TAMOE
 */

// ============================================
// DATA EXTRACTION
// ============================================

/**
 * Extract all tasks from clients data
 * @param {Array} clients - Array of client objects
 * @returns {Array} Flat array of all tasks with metadata
 */
export const extractAllTasks = (clients) => {
  const tasks = [];

  if (!clients || !Array.isArray(clients)) return tasks;

  clients.forEach(client => {
    const projects = client.projects || {};

    Object.entries(projects).forEach(([projectId, project]) => {
      // Project-level tasks
      const projectTasks = project.tasks || {};
      Object.entries(projectTasks).forEach(([taskId, task]) => {
        tasks.push({
          ...task,
          taskId,
          clientId: client.clientId,
          clientName: client.name,
          projectId,
          projectName: project.name,
          productId: null,
          productName: null,
          path: `${client.name} / ${project.name}`
        });
      });

      // Product-level tasks
      const products = project.products || {};
      Object.entries(products).forEach(([productId, product]) => {
        const productTasks = product.tasks || {};
        Object.entries(productTasks).forEach(([taskId, task]) => {
          tasks.push({
            ...task,
            taskId,
            clientId: client.clientId,
            clientName: client.name,
            projectId,
            projectName: project.name,
            productId,
            productName: product.name,
            path: `${client.name} / ${project.name} / ${product.name}`
          });
        });
      });
    });
  });

  return tasks;
};

/**
 * Extract all projects from clients data
 * @param {Array} clients - Array of client objects
 * @returns {Array} Flat array of all projects with metadata
 */
export const extractAllProjects = (clients) => {
  const projects = [];

  if (!clients || !Array.isArray(clients)) return projects;

  clients.forEach(client => {
    const clientProjects = client.projects || {};

    Object.entries(clientProjects).forEach(([projectId, project]) => {
      projects.push({
        ...project,
        projectId,
        clientId: client.clientId,
        clientName: client.name
      });
    });
  });

  return projects;
};

/**
 * Extract all products from clients data
 * @param {Array} clients - Array of client objects
 * @returns {Array} Flat array of all products with metadata
 */
export const extractAllProducts = (clients) => {
  const products = [];

  if (!clients || !Array.isArray(clients)) return products;

  clients.forEach(client => {
    const projects = client.projects || {};

    Object.entries(projects).forEach(([projectId, project]) => {
      const projectProducts = project.products || {};

      Object.entries(projectProducts).forEach(([productId, product]) => {
        products.push({
          ...product,
          productId,
          clientId: client.clientId,
          clientName: client.name,
          projectId,
          projectName: project.name
        });
      });
    });
  });

  return products;
};

// ============================================
// STATISTICS CALCULATIONS
// ============================================

/**
 * Calculate general statistics
 * @param {Array} clients - Array of client objects
 * @returns {Object} General stats
 */
export const calculateGeneralStats = (clients) => {
  const tasks = extractAllTasks(clients);
  const projects = extractAllProjects(clients);
  const products = extractAllProducts(clients);

  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.status === 'Pendiente').length;
  const inProgressTasks = tasks.filter(t => t.status === 'En proceso').length;
  const completedTasks = tasks.filter(t => t.status === 'Finalizado').length;

  const completionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  return {
    totalClients: clients?.length || 0,
    totalProjects: projects.length,
    totalProducts: products.length,
    totalTasks,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    completionRate
  };
};

/**
 * Calculate tasks per client
 * @param {Array} clients - Array of client objects
 * @returns {Array} Tasks count per client
 */
export const calculateTasksPerClient = (clients) => {
  if (!clients || !Array.isArray(clients)) return [];

  return clients.map(client => {
    const tasks = extractAllTasks([client]);
    const completed = tasks.filter(t => t.status === 'Finalizado').length;

    return {
      clientId: client.clientId,
      clientName: client.name,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'Pendiente').length,
      inProgressTasks: tasks.filter(t => t.status === 'En proceso').length,
      completedTasks: completed,
      completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0
    };
  }).sort((a, b) => b.totalTasks - a.totalTasks);
};

/**
 * Calculate tasks per project
 * @param {Array} clients - Array of client objects
 * @returns {Array} Tasks count per project
 */
export const calculateTasksPerProject = (clients) => {
  const projects = extractAllProjects(clients);

  return projects.map(project => {
    // Count tasks in project
    const projectTasks = Object.values(project.tasks || {});

    // Count tasks in products
    const productTasks = Object.values(project.products || {}).reduce((acc, product) => {
      return acc.concat(Object.values(product.tasks || {}));
    }, []);

    const allTasks = [...projectTasks, ...productTasks];
    const completed = allTasks.filter(t => t.status === 'Finalizado').length;

    return {
      projectId: project.projectId,
      projectName: project.name,
      clientId: project.clientId,
      clientName: project.clientName,
      totalTasks: allTasks.length,
      pendingTasks: allTasks.filter(t => t.status === 'Pendiente').length,
      inProgressTasks: allTasks.filter(t => t.status === 'En proceso').length,
      completedTasks: completed,
      completionRate: allTasks.length > 0 ? Math.round((completed / allTasks.length) * 100) : 0
    };
  }).sort((a, b) => b.totalTasks - a.totalTasks);
};

/**
 * Calculate tasks per user
 * @param {Array} clients - Array of client objects
 * @param {Object} usersByUid - Users indexed by UID
 * @returns {Array} Tasks count per user
 */
export const calculateTasksPerUser = (clients, usersByUid = {}) => {
  const tasks = extractAllTasks(clients);
  const userStats = {};

  tasks.forEach(task => {
    const uid = task.assigneeUid;
    if (!uid) return;

    if (!userStats[uid]) {
      const user = usersByUid[uid] || {};
      userStats[uid] = {
        uid,
        username: user.username || 'Usuario desconocido',
        email: user.email || '',
        department: user.department || '',
        totalTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0
      };
    }

    userStats[uid].totalTasks++;

    if (task.status === 'Pendiente') userStats[uid].pendingTasks++;
    else if (task.status === 'En proceso') userStats[uid].inProgressTasks++;
    else if (task.status === 'Finalizado') userStats[uid].completedTasks++;
  });

  return Object.values(userStats)
    .map(u => ({
      ...u,
      completionRate: u.totalTasks > 0 ? Math.round((u.completedTasks / u.totalTasks) * 100) : 0
    }))
    .sort((a, b) => b.totalTasks - a.totalTasks);
};

/**
 * Calculate productivity over time (last 30 days)
 * @param {Array} clients - Array of client objects
 * @returns {Array} Daily task counts
 */
export const calculateProductivityOverTime = (clients) => {
  const tasks = extractAllTasks(clients);
  const today = new Date();
  const days = [];

  // Generate last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    days.push({
      date: date.toISOString().split('T')[0],
      label: date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      created: 0,
      completed: 0
    });
  }

  // Count tasks per day
  tasks.forEach(task => {
    // Created date
    if (task.createdAt) {
      const createdDate = new Date(task.createdAt).toISOString().split('T')[0];
      const dayEntry = days.find(d => d.date === createdDate);
      if (dayEntry) dayEntry.created++;
    }

    // Completed date (using updatedAt if status is Finalizado)
    if (task.status === 'Finalizado' && task.updatedAt) {
      const completedDate = new Date(task.updatedAt).toISOString().split('T')[0];
      const dayEntry = days.find(d => d.date === completedDate);
      if (dayEntry) dayEntry.completed++;
    }
  });

  return days;
};

/**
 * Calculate priority distribution
 * @param {Array} clients - Array of client objects
 * @returns {Object} Priority counts
 */
export const calculatePriorityDistribution = (clients) => {
  const tasks = extractAllTasks(clients);

  return {
    alta: tasks.filter(t => t.priority === 'Alta').length,
    media: tasks.filter(t => t.priority === 'Media').length,
    baja: tasks.filter(t => t.priority === 'Baja').length,
    sinPrioridad: tasks.filter(t => !t.priority).length
  };
};

/**
 * Calculate overdue tasks
 * @param {Array} clients - Array of client objects
 * @returns {Array} Overdue tasks with days overdue
 */
export const calculateOverdueTasks = (clients) => {
  const tasks = extractAllTasks(clients);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasks
    .filter(task => {
      if (task.status === 'Finalizado') return false;
      if (!task.dueDate) return false;

      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      return dueDate < today;
    })
    .map(task => {
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      return {
        ...task,
        daysOverdue,
        dueDateFormatted: dueDate.toLocaleDateString('es-ES')
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
};

/**
 * Calculate upcoming deadlines (next 7 days)
 * @param {Array} clients - Array of client objects
 * @returns {Array} Tasks with upcoming deadlines
 */
export const calculateUpcomingDeadlines = (clients) => {
  const tasks = extractAllTasks(clients);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return tasks
    .filter(task => {
      if (task.status === 'Finalizado') return false;
      if (!task.dueDate) return false;

      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      return dueDate >= today && dueDate <= nextWeek;
    })
    .map(task => {
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

      return {
        ...task,
        daysUntilDue,
        dueDateFormatted: dueDate.toLocaleDateString('es-ES'),
        isToday: daysUntilDue === 0,
        isTomorrow: daysUntilDue === 1
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
};

/**
 * Calculate workload balance
 * @param {Array} clients - Array of client objects
 * @param {Object} usersByUid - Users indexed by UID
 * @returns {Object} Workload statistics
 */
export const calculateWorkloadBalance = (clients, usersByUid = {}) => {
  const userStats = calculateTasksPerUser(clients, usersByUid);

  if (userStats.length === 0) {
    return {
      average: 0,
      max: 0,
      min: 0,
      overloaded: [],
      underloaded: []
    };
  }

  const activeTasks = userStats.map(u => u.pendingTasks + u.inProgressTasks);
  const average = activeTasks.reduce((a, b) => a + b, 0) / activeTasks.length;
  const max = Math.max(...activeTasks);
  const min = Math.min(...activeTasks);

  // Overloaded: more than 1.5x average
  const overloadThreshold = average * 1.5;
  // Underloaded: less than 0.5x average
  const underloadThreshold = average * 0.5;

  return {
    average: Math.round(average * 10) / 10,
    max,
    min,
    overloaded: userStats
      .filter(u => (u.pendingTasks + u.inProgressTasks) > overloadThreshold)
      .map(u => ({ ...u, activeTasks: u.pendingTasks + u.inProgressTasks })),
    underloaded: userStats
      .filter(u => (u.pendingTasks + u.inProgressTasks) < underloadThreshold && u.totalTasks > 0)
      .map(u => ({ ...u, activeTasks: u.pendingTasks + u.inProgressTasks }))
  };
};

// ============================================
// CHART.JS DATA FORMATTERS
// ============================================

/**
 * Format data for status donut chart
 * @param {Array} clients - Array of client objects
 * @returns {Object} Chart.js data config
 */
export const formatStatusChartData = (clients) => {
  const stats = calculateGeneralStats(clients);

  return {
    labels: ['Pendiente', 'En proceso', 'Finalizado'],
    datasets: [{
      data: [stats.pendingTasks, stats.inProgressTasks, stats.completedTasks],
      backgroundColor: ['#FBBF24', '#3B82F6', '#10B981'],
      borderWidth: 0
    }]
  };
};

/**
 * Format data for priority donut chart
 * @param {Array} clients - Array of client objects
 * @returns {Object} Chart.js data config
 */
export const formatPriorityChartData = (clients) => {
  const priority = calculatePriorityDistribution(clients);

  return {
    labels: ['Alta', 'Media', 'Baja', 'Sin prioridad'],
    datasets: [{
      data: [priority.alta, priority.media, priority.baja, priority.sinPrioridad],
      backgroundColor: ['#EF4444', '#FBBF24', '#10B981', '#6B7280'],
      borderWidth: 0
    }]
  };
};

/**
 * Format data for productivity line chart
 * @param {Array} clients - Array of client objects
 * @returns {Object} Chart.js data config
 */
export const formatProductivityChartData = (clients) => {
  const productivity = calculateProductivityOverTime(clients);

  return {
    labels: productivity.map(d => d.label),
    datasets: [
      {
        label: 'Creadas',
        data: productivity.map(d => d.created),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Completadas',
        data: productivity.map(d => d.completed),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };
};

/**
 * Format data for user workload bar chart
 * @param {Array} clients - Array of client objects
 * @param {Object} usersByUid - Users indexed by UID
 * @returns {Object} Chart.js data config
 */
export const formatUserWorkloadChartData = (clients, usersByUid = {}) => {
  const userStats = calculateTasksPerUser(clients, usersByUid).slice(0, 10);

  return {
    labels: userStats.map(u => u.username),
    datasets: [
      {
        label: 'Pendiente',
        data: userStats.map(u => u.pendingTasks),
        backgroundColor: '#FBBF24'
      },
      {
        label: 'En proceso',
        data: userStats.map(u => u.inProgressTasks),
        backgroundColor: '#3B82F6'
      },
      {
        label: 'Finalizado',
        data: userStats.map(u => u.completedTasks),
        backgroundColor: '#10B981'
      }
    ]
  };
};

/**
 * Format data for client comparison bar chart
 * @param {Array} clients - Array of client objects
 * @returns {Object} Chart.js data config
 */
export const formatClientComparisonChartData = (clients) => {
  const clientStats = calculateTasksPerClient(clients).slice(0, 10);

  return {
    labels: clientStats.map(c => c.clientName),
    datasets: [{
      label: 'Tareas',
      data: clientStats.map(c => c.totalTasks),
      backgroundColor: '#8B5CF6'
    }]
  };
};

/**
 * Format data for project status bar chart
 * @param {Array} clients - Array of client objects
 * @returns {Object} Chart.js data config
 */
export const formatProjectStatusChartData = (clients) => {
  const projects = extractAllProjects(clients);

  const statusCounts = {
    'Pendiente': 0,
    'En proceso': 0,
    'Finalizado': 0
  };

  projects.forEach(p => {
    const status = p.status || 'Pendiente';
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    }
  });

  return {
    labels: Object.keys(statusCounts),
    datasets: [{
      label: 'Proyectos',
      data: Object.values(statusCounts),
      backgroundColor: ['#FBBF24', '#3B82F6', '#10B981']
    }]
  };
};
