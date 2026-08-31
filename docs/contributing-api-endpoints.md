# Contributor Checklist — Creating New API Endpoints

Use this checklist when adding a new backend endpoint to `xconfess-backend`.

---

## Backend (NestJS)

### Controller

- [ ] Create a new module directory under `src/` (e.g. `src/my-feature/`)
- [ ] Add a controller class with `@Controller('my-feature')` and appropriate `@ApiTags`
- [ ] Decorate every route with `@ApiOperation`, `@ApiResponse`, and `@ApiBody`/`@ApiQuery` where applicable
- [ ] Use `@UseGuards` for auth-protected routes (`JwtAuthGuard`, `OptionalJwtAuthGuard`, or role-based guards)

### DTO (Data Transfer Object)

- [ ] Create DTO files in `src/my-feature/dto/`
- [ ] Use `class-validator` decorators (`@IsString`, `@IsNotEmpty`, `@MaxLength`, `@IsEnum`, etc.)
- [ ] Add `@ApiProperty` / `@ApiPropertyOptional` with descriptions and examples for Swagger
- [ ] Enable `whitelist: true` in the global `ValidationPipe` (already configured in `main.ts`) so unknown fields are stripped

### Service

- [ ] Create a service class with `@Injectable()` and inject required repositories/services
- [ ] Keep business logic in the service — controllers should delegate only
- [ ] Use TypeORM repositories for database access (inject via `@InjectRepository(Entity)`)
- [ ] Throw `HttpException` or `AppException` with appropriate status codes for error cases

### Error Handling

- [ ] Use error codes from `src/common/errors/error-codes.ts` where applicable
- [ ] Throw domain-specific errors, not raw `Error` objects
- [ ] Let the global exception filters (`AllExceptionsFilter`, `HttpExceptionFilter`) handle responses

### Module

- [ ] Create a module file (`my-feature.module.ts`) with `@Module` decorator
- [ ] Register the controller, service, and any entity/repository dependencies
- [ ] Import the module in `AppModule` or the parent feature module

---

## Auth & Security

- [ ] Apply `JwtAuthGuard` or `@UseGuards(OptionalJwtAuthGuard)` for authenticated/anonymous endpoints
- [ ] Never trust client-supplied user IDs — extract from `req.user` after JWT validation
- [ ] Rate-limit sensitive endpoints using `@UseGuards(ThrottlerGuard)` or route-specific throttle config
- [ ] Validate and sanitize all inputs — never pass raw user input to database queries or external services

---

## Request ID & Observability

- [ ] Request IDs are auto-attached by `RequestIdMiddleware` in `main.ts` — no per-endpoint setup needed
- [ ] Use the `AppLogger` service for structured logging with context (e.g. `this.logger.log('...', 'MyFeature')`)
- [ ] Emit audit-log events for privileged operations via `AuditLogService` if applicable

---

## Testing

- [ ] Write unit tests for the service (`my-feature.service.spec.ts`)
- [ ] Write controller tests (`my-feature.controller.spec.ts`) — mock the service
- [ ] Write integration tests if the endpoint touches multiple services or the database
- [ ] Run `npm run backend:test` and verify all tests pass

---

## Frontend Proxy (if frontend consumes this endpoint)

- [ ] Add a proxy route in `xconfess-frontend/app/api/` that forwards requests to the backend
- [ ] Use `credentials: "include"` in the fetch call to forward cookies
- [ ] Update or add TypeScript types in `xconfess-frontend/types/` for request/response shapes
- [ ] Add or update TanStack Query hooks in `xconfess-frontend/lib/` or `xconfess-frontend/app/`

---

## Swagger / API Docs

- [ ] Verify endpoint appears in Swagger UI at `/api/api-docs` (dev mode only)
- [ ] All response schemas include realistic examples
- [ ] Error responses documented with status codes and messages

---

## CI / Quality Checks

- [ ] `npm run backend:lint` passes
- [ ] `npm run backend:build` succeeds
- [ ] `npm run backend:test` passes
- [ ] `npm run ci` passes (mirrors the full CI pipeline)

---

## Security & Privacy Checklist

- [ ] No secrets, API keys, or tokens logged or returned in responses
- [ ] PII fields are encrypted at rest if required (see `ConfessionEncryptionService`)
- [ ] CORS is configured correctly (already handled in `main.ts` via `FRONTEND_URL`)
- [ ] No new endpoints expose internal database IDs without hashing/scoping

---

## References

- [Existing confession module](../xconfess-backend/src/confession/) — follow this pattern
- [Global exception filters](../xconfess-backend/src/common/filters/)
- [Error codes](../xconfess-backend/src/common/errors/error-codes.ts)
- [main.ts bootstrap](../xconfess-backend/src/main.ts) — global pipes, filters, CORS, Swagger
