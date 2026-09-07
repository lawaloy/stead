import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt-user.interface';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { EndGoalDto } from './dto/end-goal.dto';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Post()
  create(@Req() req: Request & { user: JwtUser }, @Body() dto: CreateGoalDto) {
    return this.goals.create(req.user.userId, dto);
  }

  @Get()
  list(@Req() req: Request & { user: JwtUser }) {
    return this.goals.list(req.user.userId);
  }

  @Get('active')
  getActive(@Req() req: Request & { user: JwtUser }) {
    return this.goals.getActive(req.user.userId);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(
    @Req() req: Request & { user: JwtUser },
    @Param('id') id: string,
    @Body() dto: EndGoalDto,
  ) {
    return this.goals.end(req.user.userId, id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: JwtUser },
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goals.update(req.user.userId, id, dto);
  }
}
