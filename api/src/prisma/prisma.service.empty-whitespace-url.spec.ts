import { Test, TestingModule } from '@nestjs/testing';

const mockPrismaPg = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClientMock {},
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPgMock {
    readonly provider = 'postgres';
    readonly adapterName = '@prisma/adapter-pg';

    constructor(...args: unknown[]) {
      mockPrismaPg(...args);
    }
  },
}));

import { PrismaService } from './prisma.service';

describe('PrismaService empty vs whitespace DATABASE_URL', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const defaultConnectionString =
    'postgresql://stead:stead@localhost:5432/stead?schema=public';

  async function createService() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    return module.get<PrismaService>(PrismaService);
  }

  beforeEach(() => {
    mockPrismaPg.mockClear();
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('defaults an empty DATABASE_URL and rejects a whitespace-only URL', async () => {
    process.env.DATABASE_URL = '';

    await createService();

    expect(mockPrismaPg).toHaveBeenCalledWith(
      { connectionString: defaultConnectionString },
      { schema: 'public' },
    );

    mockPrismaPg.mockClear();
    process.env.DATABASE_URL = ' \t\n ';

    await expect(createService()).rejects.toThrow(/Invalid URL/);
    expect(mockPrismaPg).not.toHaveBeenCalled();
  });
});
