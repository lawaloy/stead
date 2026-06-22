import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CountriesService } from '../countries/countries.service';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private telemetry: AuthTelemetryService,
    private countries: CountriesService,
  ) {}

  @Get('countries')
  async getCountries() {
    return { countries: await this.countries.listAuthCountries() };
  }

  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.auth.requestOtp(dto.phone, dto.countryIso, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto.phone, dto.countryIso, dto.otp, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('inspection')
  getInspection(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.telemetry.getInspection(limit);
  }
}
