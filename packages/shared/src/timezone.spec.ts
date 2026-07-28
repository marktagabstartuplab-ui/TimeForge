import {
  orgDayKey,
  orgDateOnly,
  orgWeekDays,
  startOfOrgDay,
  startOfOrgWeek,
  DEFAULT_TIME_ZONE,
} from './timezone';

const MANILA = 'Asia/Manila'; // UTC+8, no DST
const NEW_YORK = 'America/New_York'; // UTC-4 in July, UTC-5 in January

describe('orgDayKey', () => {
  it('maps a late-evening UTC instant to the next Manila day', () => {
    // 2026-07-28T16:30Z === 2026-07-29 00:30 in Manila.
    expect(orgDayKey(new Date('2026-07-28T16:30:00Z'), MANILA)).toBe('2026-07-29');
  });

  it('maps a 7am Manila shift start to that same Manila day', () => {
    // The case that mis-filed clock-ins and split payroll days: 23:00Z is
    // already 07:00 the next morning locally.
    expect(orgDayKey(new Date('2026-07-28T23:00:00Z'), MANILA)).toBe('2026-07-29');
    // UTC bucketing would have said 2026-07-28.
    expect(new Date('2026-07-28T23:00:00Z').toISOString().slice(0, 10)).toBe('2026-07-28');
  });

  it('handles zones behind UTC', () => {
    expect(orgDayKey(new Date('2026-07-29T02:00:00Z'), NEW_YORK)).toBe('2026-07-28');
  });

  it('defaults to Manila', () => {
    expect(DEFAULT_TIME_ZONE).toBe(MANILA);
    expect(orgDayKey(new Date('2026-07-28T16:30:00Z'))).toBe('2026-07-29');
  });
});

describe('startOfOrgDay', () => {
  it('resolves a date string to local midnight as a UTC instant', () => {
    expect(startOfOrgDay('2026-07-28', MANILA)).toEqual(new Date('2026-07-27T16:00:00Z'));
  });

  it('produces an exclusive upper bound one local day later', () => {
    expect(startOfOrgDay('2026-07-28', MANILA, 1)).toEqual(new Date('2026-07-28T16:00:00Z'));
  });

  it('rolls over month ends', () => {
    expect(startOfOrgDay('2026-07-31', MANILA, 1)).toEqual(new Date('2026-07-31T16:00:00Z'));
  });

  it('accounts for DST in zones that observe it', () => {
    // EDT (UTC-4) in July, EST (UTC-5) in January.
    expect(startOfOrgDay('2026-07-28', NEW_YORK)).toEqual(new Date('2026-07-28T04:00:00Z'));
    expect(startOfOrgDay('2026-01-28', NEW_YORK)).toEqual(new Date('2026-01-28T05:00:00Z'));
  });

  it('accepts a Date and uses its local day', () => {
    expect(startOfOrgDay(new Date('2026-07-28T16:30:00Z'), MANILA)).toEqual(
      new Date('2026-07-28T16:00:00Z'),
    );
  });
});

describe('orgDateOnly', () => {
  it('names the local day as a UTC-midnight value for @db.Date columns', () => {
    expect(orgDateOnly(new Date('2026-07-28T16:30:00Z'), MANILA)).toEqual(
      new Date('2026-07-29T00:00:00Z'),
    );
    expect(orgDateOnly(new Date('2026-07-29T06:00:00Z'), MANILA)).toEqual(
      new Date('2026-07-29T00:00:00Z'),
    );
  });
});

describe('startOfOrgWeek', () => {
  it('returns the local Monday for a mid-week instant', () => {
    // 2026-07-29 is a Wednesday; its Monday is 2026-07-27 (16:00Z the day before).
    expect(startOfOrgWeek(new Date('2026-07-29T06:00:00Z'), MANILA)).toEqual(
      new Date('2026-07-26T16:00:00Z'),
    );
  });

  it('treats a Monday-morning Manila instant as the start of that same week', () => {
    // 2026-07-27T00:30+08:00 — still Sunday 2026-07-26 in UTC, so a UTC-based
    // week start pointed at the *previous* Monday.
    expect(startOfOrgWeek(new Date('2026-07-26T16:30:00Z'), MANILA)).toEqual(
      new Date('2026-07-26T16:00:00Z'),
    );
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-08-02 is a Sunday; ISO weeks start Monday 2026-07-27.
    expect(startOfOrgWeek(new Date('2026-08-02T06:00:00Z'), MANILA)).toEqual(
      new Date('2026-07-26T16:00:00Z'),
    );
  });

  it('shifts whole weeks', () => {
    expect(startOfOrgWeek(new Date('2026-07-29T06:00:00Z'), MANILA, -1)).toEqual(
      new Date('2026-07-19T16:00:00Z'),
    );
  });
});

describe('orgWeekDays', () => {
  it('lists Mon-Fri of the local week', () => {
    expect(orgWeekDays(new Date('2026-07-29T06:00:00Z'), MANILA, 0, 5)).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(orgWeekDays(new Date('2026-08-01T06:00:00Z'), MANILA, 0, 5)).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ]);
  });

  it('returns the previous week when asked', () => {
    expect(orgWeekDays(new Date('2026-07-29T06:00:00Z'), MANILA, -1, 5)[0]).toBe('2026-07-20');
  });
});
