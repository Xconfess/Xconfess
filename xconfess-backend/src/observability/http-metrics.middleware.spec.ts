import { EventEmitter } from 'events';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { OperationalMetricsService } from './operational-metrics.service';

const UUID = '3f2b8c1e-1111-4222-8333-444455556666';

function makeRes(statusCode = 200): any {
  const res: any = new EventEmitter();
  res.statusCode = statusCode;
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    originalUrl: '/api/confessions',
    url: '/api/confessions',
    baseUrl: '',
    ...overrides,
  };
}

describe('HttpMetricsMiddleware', () => {
  let metrics: OperationalMetricsService;
  let middleware: HttpMetricsMiddleware;

  beforeEach(() => {
    metrics = new OperationalMetricsService();
    middleware = new HttpMetricsMiddleware(metrics);
  });

  it('calls next() and records nothing until the response finishes', () => {
    const next = jest.fn();
    middleware.use(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(metrics.renderPrometheus()).not.toContain('route_category=');
  });

  it('records latency and status when the response finishes', () => {
    const res = makeRes(200);
    middleware.use(makeReq(), res, jest.fn());
    res.emit('finish');

    const text = metrics.renderPrometheus();
    expect(text).toContain(
      'xconfess_http_requests_total{method="GET",route_category="confessions_feed",status_class="2xx"} 1',
    );
    expect(text).toContain(
      'xconfess_http_request_duration_seconds_count{method="GET",route_category="confessions_feed",status_class="2xx"} 1',
    );
  });

  it('prefers the matched route template and never leaks the raw id', () => {
    const res = makeRes(200);
    middleware.use(
      makeReq({
        originalUrl: `/api/confessions/${UUID}?token=secret`,
        route: { path: '/api/confessions/:id' },
      }),
      res,
      jest.fn(),
    );
    res.emit('finish');

    const text = metrics.renderPrometheus();
    expect(text).toContain('route_category="confessions"');
    expect(text).not.toContain(UUID);
    expect(text).not.toContain('secret');
  });

  it('records guard/throttle style rejections (4xx) and server errors (5xx)', () => {
    for (const status of [401, 429, 500]) {
      const res = makeRes(status);
      middleware.use(
        makeReq({ method: 'POST', originalUrl: '/api/auth/login' }),
        res,
        jest.fn(),
      );
      res.emit('finish');
    }
    const text = metrics.renderPrometheus();
    expect(text).toContain('route_category="auth",status_class="4xx"} 2');
    expect(text).toContain('route_category="auth",status_class="5xx"} 1');
  });

  it('files unknown URLs (scanner traffic) under "other" without echoing them', () => {
    const res = makeRes(404);
    middleware.use(
      makeReq({ originalUrl: '/wp-admin/setup.php?user=alice@example.com' }),
      res,
      jest.fn(),
    );
    res.emit('finish');

    const text = metrics.renderPrometheus();
    expect(text).toContain('route_category="other",status_class="4xx"} 1');
    expect(text).not.toContain('wp-admin');
    expect(text).not.toContain('alice@example.com');
  });

  it('never throws into the request path if recording fails', () => {
    jest.spyOn(metrics, 'recordHttpRequest').mockImplementation(() => {
      throw new Error('boom');
    });
    const res = makeRes(200);
    middleware.use(makeReq(), res, jest.fn());
    expect(() => res.emit('finish')).not.toThrow();
  });

  it('counts a request once even if finish is emitted twice', () => {
    const res = makeRes(200);
    middleware.use(makeReq(), res, jest.fn());
    res.emit('finish');
    res.emit('finish');
    expect(metrics.renderPrometheus()).toContain(
      'route_category="confessions_feed",status_class="2xx"} 1',
    );
  });
});
