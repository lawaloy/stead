export const resolveOtpToSubmit = (otp: string, devOtpHint = '') =>
  otp.trim() || devOtpHint.trim();

export const isValidOtp = (otp: string) => /^\d{6}$/.test(otp);
