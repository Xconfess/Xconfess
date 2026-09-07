import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import type { NextFunction, Request, Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

export const cookieParserMiddleware = cookieParser();

export const csrfMiddleware = csurf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
  },
  value: (req: Request) =>
    req.headers['x-xsrf-token'] ||
    req.headers['x-csrf-token'] ||
    (req.body && req.body._csrf),
});

export function csrfCookieSetter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.csrfToken?.();
    if (token) {
      res.cookie('XSRF-TOKEN', token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: isProduction,
        path: '/',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}
