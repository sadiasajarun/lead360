import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    // Unexpected (non-HTTP) errors are bugs — log the stack so they are diagnosable, not silent.
    if (!(exception instanceof HttpException)) {
      const err = exception as Error;
      this.logger.error(`${req.method} ${req.url} -> ${err?.message}`, err?.stack);
    }
    res.status(status).json({
      success: false,
      statusCode: status,
      message: typeof payload === 'string' ? payload : (payload as Record<string, unknown>).message,
      data: null,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
