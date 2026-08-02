import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtUser } from './jwt-user.interface';

@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtUser }>();
    const operatorUserIds = new Set(
      (this.config.get<string>('AUTH_INSPECTION_OPERATOR_USER_IDS') ?? '')
        .split(',')
        .map((userId) => userId.trim())
        .filter(Boolean),
    );

    if (!request.user || !operatorUserIds.has(request.user.userId)) {
      throw new ForbiddenException('Operator access required');
    }

    return true;
  }
}
