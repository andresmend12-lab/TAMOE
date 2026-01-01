/**
 * Timeline Integration - Connects timeline module to the main dashboard
 */

import { createTimeline } from './src/ui/timeline.js';
import { store } from './src/state/store.js';

// Timeline instance
let timeline = null;

/**
 * Initialize timeline when cronograma tab is activated
 */
export const initializeTimeline = () => {
  const containerId = 'timeline-container';
  const container = document.getElementById(containerId);

  if (!container) {
    console.warn('Timeline container not found');
    return;
  }

  // Create timeline if not exists
  if (!timeline) {
    timeline = createTimeline(containerId);
  }

  // Update with current data
  updateTimelineData();

  // Subscribe to store changes
  store.subscribe(() => {
    updateTimelineData();
  }, ['allClients', 'usersByUid']);
};

/**
 * Update timeline with current store data
 */
const updateTimelineData = () => {
  if (!timeline) return;

  const clients = store.get('allClients') || [];
  const usersByUid = store.get('usersByUid') || {};

  timeline.setData(clients, usersByUid);
};

/**
 * Setup tab switching for timeline
 */
export const setupTimelineTab = () => {
  // Listen for tab changes
  const tabCronograma = document.querySelector('[data-tab="cronograma"]');

  if (tabCronograma) {
    tabCronograma.addEventListener('click', () => {
      // Small delay to ensure container is visible
      setTimeout(() => {
        initializeTimeline();
      }, 100);
    });
  }
};

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTimelineTab);
  } else {
    setupTimelineTab();
  }
}
