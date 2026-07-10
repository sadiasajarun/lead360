import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

// Signs/verifies access + refresh JWTs. JWT_SECRET is required at boot (main.ts throws otherwise).
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '1h'),
    });
  }

  signRefresh(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET', this.config.get('JWT_SECRET') as string),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
    });
  }

  verifyRefresh(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET', this.config.get('JWT_SECRET') as string),
    });
  }

  // Expiry of a signed token from its `exp` claim (used to set refresh_tokens.expires_at).
  getExpiry(token: string): Date {
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    return decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
  }
}
