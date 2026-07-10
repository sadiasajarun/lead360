import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Wraps every response in the consistent ResponsePayload shape.
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((data) => {
        // Never wrap binary/file responses — they must stream through untouched.
        if (data instanceof StreamableFile) return data;
        return {
          success: true,
          statusCode: res.statusCode,
          message: 'OK',
          data,
          timestamp: new Date().toISOString(),
          path: req.url,
        };
      }),
    );
  }
}
