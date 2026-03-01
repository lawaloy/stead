import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  SMS_PROVIDER: Joi.string().valid('twilio', 'termii').default('twilio'),
  DEV_EXPOSE_OTP: Joi.string().valid('true', 'false').default('false'),
  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_FROM: Joi.string().allow('').optional(),
  TWILIO_MESSAGING_SERVICE_SID: Joi.string().allow('').optional(),
  TERMII_API_KEY: Joi.string().allow('').optional(),
  TERMII_SENDER_ID: Joi.string().allow('').optional(),
  TERMII_CHANNEL: Joi.string().allow('').optional(),
}).unknown(true);
