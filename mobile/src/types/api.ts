import { z } from 'zod';

export const AuthRequestOtpResponseSchema = z.object({
  ok: z.boolean(),
  otp: z.string().optional(),
});
export type AuthRequestOtpResponse = z.infer<typeof AuthRequestOtpResponseSchema>;

export const AuthVerifyOtpResponseSchema = z.object({
  token: z.string(),
});
export type AuthVerifyOtpResponse = z.infer<typeof AuthVerifyOtpResponseSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  amountTotalKobo: z.number(),
  dueDate: z.string().or(z.date()),
  monthlyIncomeKobo: z.number().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().or(z.date()),
});
export type Goal = z.infer<typeof GoalSchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  goalId: z.string().nullable(),
  amountKobo: z.number(),
  direction: z.string(),
  occurredAt: z.string().or(z.date()),
  note: z.string().nullable(),
  createdAt: z.string().or(z.date()),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const DashboardMetricsSchema = z.object({
  daysRemaining: z.number(),
  remainingObligationKobo: z.number(),
  readinessPct: z.number(),
  paceRequiredMonthlyKobo: z.number(),
  safeToSpendKobo: z.number(),
  stabilityScore: z.number(),
  status: z.enum(['stable', 'warning', 'critical']),
  goalSavedKobo: z.number(),
  estimatedBalanceKobo: z.number(),
});

export const DashboardStabilityOkResponseSchema = z.object({
  ok: z.literal(true),
  goal: z.object({
    id: z.string(),
    name: z.string(),
    amountTotalKobo: z.number(),
    dueDate: z.string().or(z.date()),
    monthlyIncomeKobo: z.number().nullable(),
  }),
  metrics: DashboardMetricsSchema,
});

export const DashboardStabilityEmptyResponseSchema = z.object({
  ok: z.literal(false),
  message: z.string(),
});

export const DashboardStabilityResponseSchema = z.union([
  DashboardStabilityOkResponseSchema,
  DashboardStabilityEmptyResponseSchema,
]);
export type DashboardStabilityResponse = z.infer<
  typeof DashboardStabilityResponseSchema
>;
