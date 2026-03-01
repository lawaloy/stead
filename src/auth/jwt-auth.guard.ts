import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import type { JwtUser } from './jwt-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtUser }>();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    const secret = process.env.JWT_SECRET || 'change_me_now';

    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded !== 'object' || decoded === null) {
        throw new UnauthorizedException('Invalid token payload');
      }
      const payload = decoded as JwtPayload & { sub?: string; phone?: string };
      if (!payload.sub || !payload.phone) {
        throw new UnauthorizedException('Invalid token payload');
      }
      req.user = { userId: payload.sub, phone: payload.phone };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
