import * as Joi from 'joi';

type EnvInput = {
  SMS_PROVIDER?: string;
  AUTH_OTP_REQUEST_LIMIT_PER_HOUR?: number;
  AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR?: number;
  AUTH_OTP_RESEND_COOLDOWN_MS?: number;
  AUTH_OTP_MAX_VERIFY_ATTEMPTS?: number;
  AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW?: number;
  AUTH_OTP_VERIFY_FAILURE_WINDOW_MS?: number;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  TERMII_API_KEY?: string;
  TERMII_SENDER_ID?: string;
};

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  AUTH_OTP_REQUEST_LIMIT_PER_HOUR: Joi.number().integer().min(1).default(10),
  AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR: Joi.number()
    .integer()
    .min(1)
    .default(20),
  AUTH_OTP_RESEND_COOLDOWN_MS: Joi.number()
    .integer()
    .min(1_000)
    .default(60_000),
  AUTH_OTP_MAX_VERIFY_ATTEMPTS: Joi.number().integer().min(1).default(5),
  AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW: Joi.number()
    .integer()
    .min(1)
    .default(10),
  AUTH_OTP_VERIFY_FAILURE_WINDOW_MS: Joi.number()
    .integer()
    .min(1_000)
    .default(15 * 60 * 1000),
  SMS_PROVIDER: Joi.string().valid('twilio', 'termii').default('twilio'),
  DEV_EXPOSE_OTP: Joi.string().valid('true', 'false').default('false'),
  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_FROM: Joi.string().allow('').optional(),
  TWILIO_MESSAGING_SERVICE_SID: Joi.string().allow('').optional(),
  TERMII_API_KEY: Joi.string().allow('').optional(),
  TERMII_SENDER_ID: Joi.string().allow('').optional(),
  TERMII_CHANNEL: Joi.string().allow('').optional(),
})
  .custom((rawValue: unknown, helpers) => {
    const value = rawValue as EnvInput;
    const provider = (value.SMS_PROVIDER || 'twilio').toLowerCase();

    if (provider === 'twilio') {
      if (!value.TWILIO_ACCOUNT_SID) {
        return helpers.message({
          custom: 'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
        });
      }

      if (!value.TWILIO_AUTH_TOKEN) {
        return helpers.message({
          custom: 'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio',
        });
      }

      if (!value.TWILIO_FROM && !value.TWILIO_MESSAGING_SERVICE_SID) {
        return helpers.message({
          custom:
            'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
        });
      }
    }

    if (provider === 'termii') {
      if (!value.TERMII_API_KEY) {
        return helpers.message({
          custom: 'TERMII_API_KEY is required when SMS_PROVIDER=termii',
        });
      }

      if (!value.TERMII_SENDER_ID) {
        return helpers.message({
          custom: 'TERMII_SENDER_ID is required when SMS_PROVIDER=termii',
        });
      }
    }
    return value;
  }, 'sms provider validation')
  .unknown(true);
