import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentCategory } from '@prisma/client';
import type {
  AccountDataExport,
  AccountResponse,
  DeleteAccountResponse,
} from '../contracts/generated/types.gen';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import type { DeleteAccountDto } from './dto/delete-account.dto';
import type { UpdateConsentsDto } from './dto/update-consents.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const CONSENT_CATEGORIES = {
  analyticsEnabled: ConsentCategory.analytics,
  productResearchEnabled: ConsentCategory.product_research,
} as const;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationQueueService,
  ) {}

  async getAccount(userId: string): Promise<AccountResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { consentPreference: true },
    });
    if (!user) throw new NotFoundException('Account not found');

    return {
      profile: {
        id: user.id,
        phone: user.phone,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      consents: {
        analyticsEnabled: user.consentPreference?.analyticsEnabled ?? false,
        productResearchEnabled:
          user.consentPreference?.productResearchEnabled ?? false,
        updatedAt: user.consentPreference?.updatedAt.toISOString() ?? null,
      },
    };
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileDto,
  ): Promise<AccountResponse> {
    if (input.displayName === undefined) {
      throw new BadRequestException('At least one profile field is required');
    }
    const displayName = input.displayName?.trim() ?? null;
    if (input.displayName !== null && !displayName) {
      throw new BadRequestException('displayName must not be blank');
    }
    const result = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { displayName },
    });
    if (result.count !== 1) throw new NotFoundException('Account not found');
    return this.getAccount(userId);
  }

  async updateConsents(
    userId: string,
    input: UpdateConsentsDto,
  ): Promise<AccountResponse> {
    const entries = Object.entries(CONSENT_CATEGORIES).filter(
      ([key]) => input[key as keyof UpdateConsentsDto] !== undefined,
    );
    if (entries.length === 0) {
      throw new BadRequestException('At least one consent is required');
    }
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Account not found');
      const current = await transaction.consentPreference.findUnique({
        where: { userId },
      });
      const currentConsents = {
        analyticsEnabled: current?.analyticsEnabled ?? false,
        productResearchEnabled: current?.productResearchEnabled ?? false,
      };
      const records = entries.flatMap(([key, category]) => {
        const preferenceKey = key as
          'analyticsEnabled' | 'productResearchEnabled';
        const granted = input[preferenceKey] as boolean;
        return currentConsents[preferenceKey] === granted
          ? []
          : [{ userId, category, granted }];
      });
      if (records.length === 0) return;
      await transaction.consentPreference.upsert({
        where: { userId },
        create: {
          userId,
          analyticsEnabled:
            input.analyticsEnabled ?? currentConsents.analyticsEnabled,
          productResearchEnabled:
            input.productResearchEnabled ??
            currentConsents.productResearchEnabled,
        },
        update: {
          analyticsEnabled: input.analyticsEnabled,
          productResearchEnabled: input.productResearchEnabled,
        },
      });
      await transaction.consentRecord.createMany({ data: records });
    });
    return this.getAccount(userId);
  }

  async exportData(userId: string): Promise<AccountDataExport> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        consentPreference: true,
        consentRecords: { orderBy: { createdAt: 'asc' } },
        goals: { orderBy: { createdAt: 'asc' } },
        transactions: { orderBy: { occurredAt: 'asc' } },
        alertPreference: true,
      },
    });
    if (!user) throw new NotFoundException('Account not found');
    const [notifications, authEvents] = await Promise.all([
      this.prisma.notificationJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          provider: true,
          providerMessageId: true,
          createdAt: true,
          sentAt: true,
          failedAt: true,
        },
      }),
      this.prisma.authEvent.findMany({
        where: { OR: [{ userId }, { phone: user.phone }] },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        phone: user.phone,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      consents: {
        analyticsEnabled: user.consentPreference?.analyticsEnabled ?? false,
        productResearchEnabled:
          user.consentPreference?.productResearchEnabled ?? false,
        updatedAt: user.consentPreference?.updatedAt.toISOString() ?? null,
      },
      consentHistory: user.consentRecords.map((record) => ({
        category: record.category,
        granted: record.granted,
        createdAt: record.createdAt.toISOString(),
      })),
      goals: user.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        amountTotalKobo: Number(goal.amountTotalKobo),
        dueDate: goal.dueDate.toISOString(),
        monthlyIncomeKobo:
          goal.monthlyIncomeKobo === null
            ? null
            : Number(goal.monthlyIncomeKobo),
        isActive: goal.isActive,
        status: goal.status,
        endedAt: goal.endedAt?.toISOString() ?? null,
        createdAt: goal.createdAt.toISOString(),
      })),
      transactions: user.transactions.map((transaction) => ({
        id: transaction.id,
        goalId: transaction.goalId,
        amountKobo: Number(transaction.amountKobo),
        direction: transaction.direction as 'in' | 'out',
        occurredAt: transaction.occurredAt.toISOString(),
        note: transaction.note,
        createdAt: transaction.createdAt.toISOString(),
      })),
      alertPreferences: user.alertPreference
        ? {
            weeklySummaryEnabled: user.alertPreference.weeklySummaryEnabled,
            riskAlertsEnabled: user.alertPreference.riskAlertsEnabled,
            timeZone: user.alertPreference.timeZone,
            weeklyDay: user.alertPreference.weeklyDay,
            weeklyHourLocal: user.alertPreference.weeklyHourLocal,
            updatedAt: user.alertPreference.updatedAt.toISOString(),
          }
        : null,
      authHistory: authEvents.map((event) => ({
        type: event.type,
        countryIso: event.countryIso,
        createdAt: event.createdAt.toISOString(),
      })),
      notificationHistory: notifications.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        provider: job.provider,
        providerMessageId: job.providerMessageId,
        createdAt: job.createdAt.toISOString(),
        sentAt: job.sentAt?.toISOString() ?? null,
        failedAt: job.failedAt?.toISOString() ?? null,
      })),
    };
  }

  async deleteAccount(
    userId: string,
    input: DeleteAccountDto,
  ): Promise<DeleteAccountResponse> {
    void input.confirmation;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user) throw new NotFoundException('Account not found');

    try {
      const legacyNotificationIds =
        await this.notifications.beginAccountDeletion(userId, user.phone);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.notificationJob.deleteMany({
          where: {
            OR: [{ userId }, { id: { in: legacyNotificationIds } }],
          },
        });
        await transaction.authEvent.deleteMany({
          where: { OR: [{ userId }, { phone: user.phone }] },
        });
        await transaction.otpCode.deleteMany({ where: { userId } });
        await transaction.transaction.deleteMany({ where: { userId } });
        await transaction.alertState.deleteMany({ where: { userId } });
        await transaction.alertPreference.deleteMany({ where: { userId } });
        await transaction.consentPreference.deleteMany({ where: { userId } });
        await transaction.consentRecord.deleteMany({ where: { userId } });
        await transaction.goal.deleteMany({ where: { userId } });
        const deleted = await transaction.user.deleteMany({
          where: { id: userId },
        });
        if (deleted.count !== 1) {
          throw new NotFoundException('Account not found');
        }
      });
      this.notifications.finalizeAccountDeletion(userId);
    } catch (error: unknown) {
      this.notifications.restoreForAccount(userId);
      throw error;
    }

    return { ok: true, deletedAt: new Date().toISOString() };
  }
}
