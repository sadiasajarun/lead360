import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// On login/refresh the handler returns { user, accessToken, refreshToken };
// this interceptor moves the tokens into httpOnly cookies and strips them from the body.
@Injectable()
export class SetTokenInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    const base = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
    return next.handle().pipe(
      map((data: { user?: unknown; accessToken?: string; refreshToken?: string }) => {
        if (data?.accessToken) res.cookie('access_token', data.accessToken, base);
        if (data?.refreshToken) res.cookie('refresh_token', data.refreshToken, base);
        return { user: data?.user ?? data };
      }),
    );
  }
}
