import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

function randomOtp(len = 6) {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private jwt: JwtService,
  ) {}

  async requestOtp(phone: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpCode.count({
      where: { user: { phone }, createdAt: { gte: oneHourAgo } },
    });
    if (recent >= 10) {
      throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });

    const otp = randomOtp(6);
    const codeHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { userId: user.id, codeHash, expiresAt },
    });

    await this.sms.sendOtp(phone, otp);

    if (process.env.DEV_EXPOSE_OTP === 'true') {
      return { ok: true, otp };
    }

    return { ok: true };
  }

  async verifyOtp(phone: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new BadRequestException('Invalid phone or code');

    const record = await this.prisma.otpCode.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('OTP expired or not found');

    const ok = await bcrypt.compare(otp, record.codeHash);
    if (!ok) throw new BadRequestException('Invalid phone or code');

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    const token = await this.jwt.signAsync({ sub: user.id, phone: user.phone });
    return { token };
  }
}
