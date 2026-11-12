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

describe('PrismaService empty vs whitespace schema query param', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const whitespaceSchema = ' \t\n ';
  const emptySchemaUrl =
    'postgresql://stead:stead@localhost:5432/stead?schema=';
  const whitespaceSchemaUrl = `postgresql://stead:stead@localhost:5432/stead?schema=${encodeURIComponent(
    whitespaceSchema,
  )}`;

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

  it('defaults an empty schema query param to public and forwards whitespace-only schema names', async () => {
    process.env.DATABASE_URL = emptySchemaUrl;

    await createService();

    expect(mockPrismaPg).toHaveBeenCalledWith(
      { connectionString: emptySchemaUrl },
      { schema: 'public' },
    );

    mockPrismaPg.mockClear();
    process.env.DATABASE_URL = whitespaceSchemaUrl;

    await createService();

    expect(mockPrismaPg).toHaveBeenCalledWith(
      { connectionString: whitespaceSchemaUrl },
      { schema: whitespaceSchema },
    );
  });
});
