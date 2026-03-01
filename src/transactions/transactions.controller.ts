import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt-user.interface';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(@Req() req: Request & { user: JwtUser }, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(req.user.userId, dto);
  }

  @Get()
  list(@Req() req: Request & { user: JwtUser }, @Query() query: ListTransactionsQueryDto) {
    return this.transactions.list(req.user.userId, query);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: JwtUser },
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: JwtUser }, @Param('id') id: string) {
    return this.transactions.remove(req.user.userId, id);
  }
}
