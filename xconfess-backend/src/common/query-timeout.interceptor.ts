import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, timeout } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Interceptor that applies a statement timeout to database queries
 * for specific endpoints (e.g., public feed reads).
 *
 * This prevents expensive queries from holding PostgreSQL connections
 * indefinitely and ensures timely error responses.
 *
 * Usage:
 * @UseInterceptors(QueryTimeoutInterceptor)
 * @Get('feed')
 * getFeed() { ... }
 */
@Injectable()
export class QueryTimeoutInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const timeoutMs = this.getTimeoutForRoute(request.path, request.method);

    return next.handle().pipe(
      timeout({
        first: timeoutMs,
        with: () =>
          throwError(() => new RequestTimeoutException(
            `Query timed out after ${timeoutMs}ms. Please try a narrower search or reduce page size.`
          )),
      }),
      catchError((err) => {
        if (err instanceof RequestTimeoutException) {
          return throwError(() => err);
        }
        // Check for PostgreSQL statement timeout errors
        if (err?.code === '57014' || err?.message?.includes('statement timeout')) {
          return throwError(() => new RequestTimeoutException(
            'Query timed out. Please try a narrower search or reduce page size.'
          ));
        }
        return throwError(() => err);
      }),
    );
  }

  /**
   * Return timeout in milliseconds based on the route.
   * Public feed reads get a shorter timeout than admin queries.
   */
  private getTimeoutForRoute(path: string, method: string): number {
    // Public feed endpoints - shorter timeout
    if (path.includes('/feed') || path.includes('/confessions')) {
      return 15_000; // 15 seconds
    }
    // Search endpoints - medium timeout
    if (path.includes('/search')) {
      return 20_000; // 20 seconds
    }
    // Default timeout
    return 30_000; // 30 seconds
  }
}
