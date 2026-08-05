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

describe('PrismaService', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

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

  it('should be defined', async () => {
    const service = await createService();

    expect(service).toBeDefined();
  });

  it('passes the URL schema to the PostgreSQL driver adapter', async () => {
    const connectionString =
      'postgresql://stead:stead@localhost:5432/stead?schema=e2e';
    process.env.DATABASE_URL = connectionString;

    await createService();

    expect(mockPrismaPg).toHaveBeenCalledWith(
      { connectionString },
      { schema: 'e2e' },
    );
  });

  it('defaults the PostgreSQL driver adapter to the public schema', async () => {
    const connectionString = 'postgresql://stead:stead@localhost:5432/stead';
    process.env.DATABASE_URL = connectionString;

    await createService();

    expect(mockPrismaPg).toHaveBeenCalledWith(
      { connectionString },
      { schema: 'public' },
    );
  });
});
