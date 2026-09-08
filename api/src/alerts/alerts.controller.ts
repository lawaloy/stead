import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt-user.interface';
import { AlertsService } from './alerts.service';
import { UpdateAlertPreferencesDto } from './dto/update-alert-preferences.dto';

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('preferences')
  getPreferences(@Req() req: Request & { user: JwtUser }) {
    return this.alerts.getPreferences(req.user.userId);
  }

  @Patch('preferences')
  updatePreferences(
    @Req() req: Request & { user: JwtUser },
    @Body() dto: UpdateAlertPreferencesDto,
  ) {
    return this.alerts.updatePreferences(req.user.userId, dto);
  }
}
