export const resolveOtpToSubmit = (otp: string, devOtpHint = '') =>
  otp.trim() || devOtpHint.trim();
