import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt-user.interface';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Post()
  create(@Req() req: Request & { user: JwtUser }, @Body() dto: CreateGoalDto) {
    return this.goals.create(req.user.userId, dto);
  }

  @Get('active')
  getActive(@Req() req: Request & { user: JwtUser }) {
    return this.goals.getActive(req.user.userId);
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
