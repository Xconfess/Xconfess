import { BadRequestException, ValidationError } from '@nestjs/common';
import {
  buildValidationExceptionBody,
  validationExceptionFactory,
} from './validation-exception-factory';

/**
 * Issue #2125 — unit coverage for the shared validation exception factory.
 * The e2e suite in `test/api-error-contract.e2e-spec.ts` asserts that the
 * envelope reaches the wire correctly; these tests pin down the pure
 * transformation from `ValidationError[]` to the structured body.
 */

function makeError(
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  const err = new ValidationError();
  err.property = property;
  err.constraints = constraints;
  err.children = children;
  return err;
}

describe('validation-exception-factory (Issue #2125)', () => {
  it('builds a schema-v1-shaped body for a simple validation failure', () => {
    const body = buildValidationExceptionBody([
      makeError('email', { isEmail: 'email must be an email' }),
    ]);

    expect(body).toEqual({
      code: 'BAD_REQUEST',
      message: ['email must be an email'],
      details: { fields: { email: ['email must be an email'] } },
    });
  });

  it('collapses multiple constraints on one field into one messages array', () => {
    const body = buildValidationExceptionBody([
      makeError('password', {
        minLength: 'password must be at least 8 characters',
        matches: 'password must contain a number',
      }),
    ]);

    expect(body.details.fields.password).toEqual(
      expect.arrayContaining([
        'password must be at least 8 characters',
        'password must contain a number',
      ]),
    );
    expect(body.details.fields.password).toHaveLength(2);
  });

  it('emits dotted paths for nested validation failures', () => {
    const body = buildValidationExceptionBody([
      makeError('user', {}, [
        makeError('profile', {}, [
          makeError('age', { isPositive: 'age must be positive' }),
        ]),
      ]),
    ]);

    expect(body.details.fields).toEqual({
      'user.profile.age': ['age must be positive'],
    });
  });

  it('never echoes the caller-supplied value back in the body', () => {
    // A ValidationError surfaced by class-validator carries the offending
    // `value` on the ValidationError object. The factory must drop it so
    // secrets or private content cannot leak through the error payload.
    const err = makeError('token', { isString: 'token must be a string' });
    // Simulate class-validator attaching the value.
    (err as any).value = 'super-secret-session-token';

    const body = buildValidationExceptionBody([err]);

    expect(JSON.stringify(body)).not.toContain('super-secret-session-token');
    expect(body.details.fields.token).toEqual(['token must be a string']);
  });

  it('is empty-safe', () => {
    expect(buildValidationExceptionBody([])).toEqual({
      code: 'BAD_REQUEST',
      message: [],
      details: { fields: {} },
    });
  });

  it('exposes the body via a BadRequestException factory', () => {
    const ex = validationExceptionFactory([
      makeError('email', { isEmail: 'email must be an email' }),
    ]);
    expect(ex).toBeInstanceOf(BadRequestException);
    expect(ex.getResponse()).toMatchObject({
      code: 'BAD_REQUEST',
      message: ['email must be an email'],
      details: { fields: { email: ['email must be an email'] } },
    });
  });

  it('drops a property that has no constraints and no children', () => {
    // class-validator sometimes emits a ValidationError whose only
    // signal is nested `children`; one without constraints or children
    // carries no actionable detail and should not create an empty entry.
    const body = buildValidationExceptionBody([
      makeError('decorative', {}),
    ]);
    expect(body.details.fields).toEqual({});
  });
});
