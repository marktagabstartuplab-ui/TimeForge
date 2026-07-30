import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_OVERTIME_MULTIPLIER,
  OvertimeRateService,
  normalizeOvertimeMultiplier,
} from './overtime-rate.service';

/**
 * BUG-AQ — the overtime premium became an organization setting. Every path that
 * can't produce a trustworthy number must land on the previous hardcoded 1.25,
 * because the alternative is silently paying people the wrong amount.
 */
describe('OvertimeRateService', () => {
  let service: OvertimeRateService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { organizationSetting: { findFirst: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OvertimeRateService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OvertimeRateService);
  });

  it('returns the configured multiplier', async () => {
    prisma.organizationSetting.findFirst.mockResolvedValue({
      value: { dailyThresholdHours: 8, multiplier: 1.5 },
    });

    await expect(service.forOrganization('tenant-1', 'org-1')).resolves.toBe(1.5);
  });

  it('falls back to 1.25 when the organization has no setting', async () => {
    prisma.organizationSetting.findFirst.mockResolvedValue(null);

    await expect(service.forOrganization('tenant-1', 'org-1')).resolves.toBe(
      DEFAULT_OVERTIME_MULTIPLIER,
    );
  });

  it('falls back when the setting exists but carries no multiplier', async () => {
    prisma.organizationSetting.findFirst.mockResolvedValue({ value: { dailyThresholdHours: 8 } });

    await expect(service.forOrganization('tenant-1', 'org-1')).resolves.toBe(
      DEFAULT_OVERTIME_MULTIPLIER,
    );
  });

  describe('normalizeOvertimeMultiplier', () => {
    it('accepts a numeric string', () => {
      expect(normalizeOvertimeMultiplier('1.3')).toBe(1.3);
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['non-numeric', 'time and a half'],
      ['below 1x — overtime would pay less than regular time', 0.8],
      // 25 is the "typed 25 meaning 25%" mistake; it would pay 25x.
      ['absurdly high', 25],
      ['NaN', NaN],
    ])('falls back on %s', (_label, input) => {
      expect(normalizeOvertimeMultiplier(input)).toBe(DEFAULT_OVERTIME_MULTIPLIER);
    });
  });
});
