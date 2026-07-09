import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { OrganizationService } from '../organization/organization.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { UsersService } from '../users/users.service';

describe('AdminService', () => {
  let service: AdminService;
  let orgService: jest.Mocked<OrganizationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: OrganizationService,
          useValue: { getSettings: jest.fn(), upsertSetting: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: { organizationSetting: { findMany: jest.fn() } },
        },
        {
          provide: ApprovalsService,
          useValue: { decide: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: { approve: jest.fn(), reject: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    orgService = module.get(OrganizationService) as jest.Mocked<OrganizationService>;
  });

  describe('getAiConfig', () => {
    it('returns only ai.* settings keyed by name', async () => {
      orgService.getSettings.mockResolvedValue([
        { key: 'ai.toggles', value: { smartSuggestions: true }, type: 'json' } as any,
        { key: 'ai.provider', value: 'openai', type: 'scalar' } as any,
        { key: 'org.logo', value: 'logo.png', type: 'scalar' } as any,
      ]);

      const result = await service.getAiConfig('tenant-1', 'org-1');

      expect(result).toEqual({
        'ai.toggles': { value: { smartSuggestions: true }, type: 'json' },
        'ai.provider': { value: 'openai', type: 'scalar' },
      });
      expect(orgService.getSettings).toHaveBeenCalledWith('tenant-1', 'org-1');
    });

    it('returns empty object when no ai.* settings exist', async () => {
      orgService.getSettings.mockResolvedValue([
        { key: 'org.logo', value: 'logo.png', type: 'scalar' } as any,
      ]);

      const result = await service.getAiConfig('tenant-1', 'org-1');
      expect(result).toEqual({});
    });

    it('returns empty object when settings array is empty', async () => {
      orgService.getSettings.mockResolvedValue([]);
      const result = await service.getAiConfig('tenant-1', 'org-1');
      expect(result).toEqual({});
    });
  });
});
