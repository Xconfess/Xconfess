declare module 'cookie-parser' {
  import { RequestHandler } from 'express';

  function cookieParser(
    secret?: string | string[],
    options?: Record<string, unknown>,
  ): RequestHandler;

  export default cookieParser;
}
