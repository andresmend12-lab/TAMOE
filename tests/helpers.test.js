/**
 * Tests for utility helper functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showEl,
  hideEl,
  toggleEl,
  escapeHtml,
  truncate,
  buildManagePrefixFromName,
  formatManageId,
  generateId,
  toISOString,
  formatDate,
  formatRelativeTime,
  isToday,
  startOfDay,
  endOfDay,
  isValidEmail,
  isNonEmptyString,
  isValidStatus,
  isValidPriority,
  safeEntries,
  safeValues,
  safeKeys,
  count,
  sortBy,
  groupBy,
  debounce,
  throttle,
  sleep,
  getStatusColorClass,
  getPriorityColorClass,
  calculateProgress,
  safeJsonParse,
  formatErrorMessage
} from '../src/utils/helpers.js';

// ============================================
// DOM UTILITIES
// ============================================

describe('DOM Utilities', () => {
  describe('showEl', () => {
    it('should remove hidden class from element', () => {
      const el = document.createElement('div');
      el.classList.add('hidden');
      showEl(el);
      expect(el.classList.contains('hidden')).toBe(false);
    });

    it('should handle null element gracefully', () => {
      expect(() => showEl(null)).not.toThrow();
    });
  });

  describe('hideEl', () => {
    it('should add hidden class to element', () => {
      const el = document.createElement('div');
      hideEl(el);
      expect(el.classList.contains('hidden')).toBe(true);
    });

    it('should handle null element gracefully', () => {
      expect(() => hideEl(null)).not.toThrow();
    });
  });

  describe('toggleEl', () => {
    it('should toggle hidden class', () => {
      const el = document.createElement('div');
      toggleEl(el);
      expect(el.classList.contains('hidden')).toBe(true);
      toggleEl(el);
      expect(el.classList.contains('hidden')).toBe(false);
    });

    it('should force show when show=true', () => {
      const el = document.createElement('div');
      el.classList.add('hidden');
      toggleEl(el, true);
      expect(el.classList.contains('hidden')).toBe(false);
    });

    it('should force hide when show=false', () => {
      const el = document.createElement('div');
      toggleEl(el, false);
      expect(el.classList.contains('hidden')).toBe(true);
    });
  });
});

// ============================================
// STRING UTILITIES
// ============================================

describe('String Utilities', () => {
  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const long = 'This is a very long string that should be truncated';
      const result = truncate(long, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate short strings', () => {
      const short = 'Short';
      expect(truncate(short, 20)).toBe(short);
    });

    it('should handle empty string', () => {
      expect(truncate('', 20)).toBe('');
    });
  });

  describe('buildManagePrefixFromName', () => {
    it('should build prefix from two words', () => {
      expect(buildManagePrefixFromName('Test Company')).toBe('TC');
      expect(buildManagePrefixFromName('Acme Corp')).toBe('AC');
    });

    it('should handle single word', () => {
      expect(buildManagePrefixFromName('Testing')).toBe('TE');
    });

    it('should handle empty/null', () => {
      expect(buildManagePrefixFromName('')).toBe('XX');
      expect(buildManagePrefixFromName(null)).toBe('XX');
    });

    it('should return uppercase', () => {
      expect(buildManagePrefixFromName('lowercase company')).toBe('LC');
    });
  });

  describe('formatManageId', () => {
    it('should format manage ID correctly', () => {
      expect(formatManageId('TC', 1)).toBe('TC-001');
      expect(formatManageId('AB', 42)).toBe('AB-042');
      expect(formatManageId('XY', 999)).toBe('XY-999');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate non-empty string', () => {
      expect(generateId().length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// DATE UTILITIES
// ============================================

describe('Date Utilities', () => {
  describe('toISOString', () => {
    it('should return ISO string for current date', () => {
      const result = toISOString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return ISO string for given date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(toISOString(date)).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-15');
      const result = formatDate(date);
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should handle invalid date', () => {
      expect(formatDate('invalid')).toBe('');
    });
  });

  describe('isToday', () => {
    it('should return true for today', () => {
      expect(isToday(new Date())).toBe(true);
    });

    it('should return false for other dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });
  });

  describe('startOfDay', () => {
    it('should return start of day', () => {
      const date = new Date('2024-01-15T14:30:00');
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  describe('endOfDay', () => {
    it('should return end of day', () => {
      const date = new Date('2024-01-15T14:30:00');
      const result = endOfDay(date);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
    });
  });
});

// ============================================
// VALIDATION UTILITIES
// ============================================

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.org')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('no@domain')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString(' hello ')).toBe(true);
    });

    it('should return false for empty/whitespace', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
    });
  });

  describe('isValidStatus', () => {
    it('should validate correct statuses', () => {
      expect(isValidStatus('Pendiente')).toBe(true);
      expect(isValidStatus('En proceso')).toBe(true);
      expect(isValidStatus('Finalizado')).toBe(true);
    });

    it('should reject invalid statuses', () => {
      expect(isValidStatus('invalid')).toBe(false);
      expect(isValidStatus('')).toBe(false);
    });
  });

  describe('isValidPriority', () => {
    it('should validate correct priorities', () => {
      expect(isValidPriority('Alta')).toBe(true);
      expect(isValidPriority('Media')).toBe(true);
      expect(isValidPriority('Baja')).toBe(true);
    });

    it('should reject invalid priorities', () => {
      expect(isValidPriority('invalid')).toBe(false);
      expect(isValidPriority('')).toBe(false);
    });
  });
});

// ============================================
// COLLECTION UTILITIES
// ============================================

describe('Collection Utilities', () => {
  describe('safeEntries', () => {
    it('should return entries for valid object', () => {
      expect(safeEntries({ a: 1, b: 2 })).toEqual([['a', 1], ['b', 2]]);
    });

    it('should return empty array for null/undefined', () => {
      expect(safeEntries(null)).toEqual([]);
      expect(safeEntries(undefined)).toEqual([]);
    });
  });

  describe('safeValues', () => {
    it('should return values for valid object', () => {
      expect(safeValues({ a: 1, b: 2 })).toEqual([1, 2]);
    });

    it('should return empty array for null/undefined', () => {
      expect(safeValues(null)).toEqual([]);
    });
  });

  describe('safeKeys', () => {
    it('should return keys for valid object', () => {
      expect(safeKeys({ a: 1, b: 2 })).toEqual(['a', 'b']);
    });

    it('should return empty array for null/undefined', () => {
      expect(safeKeys(null)).toEqual([]);
    });
  });

  describe('count', () => {
    it('should count array items', () => {
      expect(count([1, 2, 3])).toBe(3);
    });

    it('should count object keys', () => {
      expect(count({ a: 1, b: 2 })).toBe(2);
    });

    it('should return 0 for null/undefined', () => {
      expect(count(null)).toBe(0);
    });
  });

  describe('sortBy', () => {
    it('should sort array by property', () => {
      const arr = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
      expect(sortBy(arr, 'name')).toEqual([
        { name: 'a' },
        { name: 'b' },
        { name: 'c' }
      ]);
    });

    it('should sort descending', () => {
      const arr = [{ num: 1 }, { num: 3 }, { num: 2 }];
      expect(sortBy(arr, 'num', true)).toEqual([
        { num: 3 },
        { num: 2 },
        { num: 1 }
      ]);
    });
  });

  describe('groupBy', () => {
    it('should group array by property', () => {
      const arr = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 }
      ];
      const result = groupBy(arr, 'type');
      expect(result.a).toHaveLength(2);
      expect(result.b).toHaveLength(1);
    });
  });
});

// ============================================
// ASYNC UTILITIES
// ============================================

describe('Async Utilities', () => {
  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();

      await sleep(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should throttle function calls', async () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 50);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('sleep', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });
});

// ============================================
// STATUS UTILITIES
// ============================================

describe('Status Utilities', () => {
  describe('getStatusColorClass', () => {
    it('should return correct classes for each status', () => {
      expect(getStatusColorClass('Pendiente')).toContain('yellow');
      expect(getStatusColorClass('En proceso')).toContain('blue');
      expect(getStatusColorClass('Finalizado')).toContain('green');
    });

    it('should return gray for unknown status', () => {
      expect(getStatusColorClass('unknown')).toContain('gray');
    });
  });

  describe('getPriorityColorClass', () => {
    it('should return correct classes for each priority', () => {
      expect(getPriorityColorClass('Alta')).toContain('red');
      expect(getPriorityColorClass('Media')).toContain('yellow');
      expect(getPriorityColorClass('Baja')).toContain('green');
    });
  });

  describe('calculateProgress', () => {
    it('should calculate progress percentage', () => {
      const tasks = {
        t1: { status: 'Finalizado' },
        t2: { status: 'En proceso' },
        t3: { status: 'Pendiente' },
        t4: { status: 'Finalizado' }
      };
      expect(calculateProgress(tasks)).toBe(50);
    });

    it('should return 0 for empty tasks', () => {
      expect(calculateProgress({})).toBe(0);
      expect(calculateProgress(null)).toBe(0);
    });

    it('should return 100 for all completed', () => {
      const tasks = {
        t1: { status: 'Finalizado' },
        t2: { status: 'Finalizado' }
      };
      expect(calculateProgress(tasks)).toBe(100);
    });
  });
});

// ============================================
// ERROR HANDLING
// ============================================

describe('Error Handling', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid', {})).toEqual({});
      expect(safeJsonParse('invalid', null)).toBe(null);
    });
  });

  describe('formatErrorMessage', () => {
    it('should format Error object', () => {
      expect(formatErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('should return string as-is', () => {
      expect(formatErrorMessage('String error')).toBe('String error');
    });

    it('should return default for unknown', () => {
      expect(formatErrorMessage(null)).toContain('error');
    });
  });
});

// ============================================
// CUSTOM MATCHERS
// ============================================

describe('Custom Matchers', () => {
  describe('toBeValidManageId', () => {
    it('should match valid manage IDs', () => {
      expect('TC-001').toBeValidManageId();
      expect('AB-999').toBeValidManageId();
    });

    it('should not match invalid manage IDs', () => {
      expect('invalid').not.toBeValidManageId();
      expect('TC001').not.toBeValidManageId();
    });
  });

  describe('toBeValidStatus', () => {
    it('should match valid statuses', () => {
      expect('Pendiente').toBeValidStatus();
      expect('En proceso').toBeValidStatus();
      expect('Finalizado').toBeValidStatus();
    });

    it('should not match invalid statuses', () => {
      expect('invalid').not.toBeValidStatus();
    });
  });

  describe('toBeValidPriority', () => {
    it('should match valid priorities', () => {
      expect('Alta').toBeValidPriority();
      expect('Media').toBeValidPriority();
      expect('Baja').toBeValidPriority();
    });

    it('should not match invalid priorities', () => {
      expect('invalid').not.toBeValidPriority();
    });
  });
});
