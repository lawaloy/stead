import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt-user.interface';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateConsentsDto } from './dto/update-consents.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  getAccount(@Req() req: Request & { user: JwtUser }) {
    return this.account.getAccount(req.user.userId);
  }

  @Patch('profile')
  updateProfile(
    @Req() req: Request & { user: JwtUser },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.account.updateProfile(req.user.userId, dto);
  }

  @Put('consents')
  updateConsents(
    @Req() req: Request & { user: JwtUser },
    @Body() dto: UpdateConsentsDto,
  ) {
    return this.account.updateConsents(req.user.userId, dto);
  }

  @Get('export')
  exportData(@Req() req: Request & { user: JwtUser }) {
    return this.account.exportData(req.user.userId);
  }

  @Delete()
  deleteAccount(
    @Req() req: Request & { user: JwtUser },
    @Body() dto: DeleteAccountDto,
  ) {
    return this.account.deleteAccount(req.user.userId, dto);
  }
}
