import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatHours,
  formatPercent,
  formatDate,
  formatNotes,
  truncate,
  getStageColor,
  PROJECT_STATUS_STYLES,
  PROJECT_STATUS_COLORS,
} from './formatting';

describe('formatCurrency', () => {
  it('formats positive numbers correctly', () => {
    expect(formatCurrency(1000)).toBe('$1,000');
    expect(formatCurrency(1234567.89)).toBe('$1,234,568');
  });

  it('returns N/A for null/undefined', () => {
    expect(formatCurrency(null)).toBe('N/A');
    expect(formatCurrency(undefined)).toBe('N/A');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('handles negative numbers', () => {
    expect(formatCurrency(-500)).toBe('-$500');
  });
});

describe('formatHours', () => {
  it('formats hours as rounded integers', () => {
    expect(formatHours(10.5)).toBe('11h'); // Rounds to nearest integer
    expect(formatHours(100)).toBe('100h');
    expect(formatHours(0.25)).toBe('0h'); // Rounds down
    expect(formatHours(10.4)).toBe('10h');
  });

  it('returns N/A for null/undefined', () => {
    expect(formatHours(null)).toBe('N/A');
    expect(formatHours(undefined)).toBe('N/A');
  });
});

describe('formatPercent', () => {
  it('formats percentages correctly', () => {
    expect(formatPercent(50)).toBe('50%'); // Integer stays as integer
    expect(formatPercent(99.9)).toBe('99.9%'); // Decimal preserved
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(33.33)).toBe('33.3%'); // Max 1 decimal
  });

  it('returns N/A for null/undefined', () => {
    expect(formatPercent(null)).toBe('N/A');
    expect(formatPercent(undefined)).toBe('N/A');
  });
});

describe('formatDate', () => {
  it('formats dates in Australian format', () => {
    // toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'})
    const result = formatDate('2025-06-15');
    expect(result).toContain('Jun');
    expect(result).toContain('2025');
  });

  it('returns N/A for null/undefined', () => {
    expect(formatDate(null)).toBe('N/A');
    expect(formatDate(undefined)).toBe('N/A');
  });

  it('formats different years correctly', () => {
    const result = formatDate('2020-06-15');
    expect(result).toContain('Jun');
    expect(result).toContain('2020');
  });
});

describe('formatNotes', () => {
  it('returns empty for null/undefined', () => {
    expect(formatNotes(undefined)).toBe('');
    expect(formatNotes(null as unknown as string)).toBe('');
  });

  it('passes through regular notes', () => {
    expect(formatNotes('This is a note')).toBe('This is a note');
  });

  it('formats WIP values with max 1 decimal', () => {
    expect(formatNotes('PM: John | WIP: 1234.5678')).toBe('PM: John | WIP: 1234.6');
    expect(formatNotes('WIP: 100.00')).toBe('WIP: 100');
    expect(formatNotes('Notes with WIP: 50.5 extra')).toBe('Notes with WIP: 50.5 extra');
  });

  it('preserves PM prefix (does not strip it)', () => {
    expect(formatNotes('PM: John Doe | Additional notes')).toBe('PM: John Doe | Additional notes');
  });
});

describe('truncate', () => {
  it('returns original string if shorter than maxLength', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates long strings with ellipsis', () => {
    // slice(0, maxLength - 3) + '...' = slice(0, 7) + '...' = 'this is...'
    expect(truncate('this is a very long string', 10)).toBe('this is...');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles exact length', () => {
    expect(truncate('exactly10!', 10)).toBe('exactly10!');
  });
});

describe('getStageColor', () => {
  it('returns colors for known stages', () => {
    expect(getStageColor('Proposal')).toContain('bg-');
    expect(getStageColor('Closed Won')).toBe('bg-green-600');
    expect(getStageColor('Early Lead')).toBe('bg-blue-500');
    expect(getStageColor('Quotation')).toBe('bg-purple-500');
    expect(getStageColor('Lost')).toBe('bg-red-500');
  });

  it('returns default color for unknown stages', () => {
    expect(getStageColor('Unknown Stage')).toBe('bg-gray-500');
  });

  it('returns default color for null/undefined', () => {
    expect(getStageColor(null)).toBe('bg-gray-500');
    expect(getStageColor(undefined)).toBe('bg-gray-500');
  });
});

describe('PROJECT_STATUS constants', () => {
  it('has all expected statuses', () => {
    expect(PROJECT_STATUS_STYLES).toHaveProperty('ACTIVE');
    expect(PROJECT_STATUS_STYLES).toHaveProperty('ON_HOLD');
    expect(PROJECT_STATUS_STYLES).toHaveProperty('COMPLETED');
  });

  it('has matching colors for styles', () => {
    const styleKeys = Object.keys(PROJECT_STATUS_STYLES);
    const colorKeys = Object.keys(PROJECT_STATUS_COLORS);
    expect(styleKeys.sort()).toEqual(colorKeys.sort());
  });
});
