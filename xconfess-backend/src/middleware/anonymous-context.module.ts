import { Module } from '@nestjs/common';
import { AnonymousContextMiddleware } from './anonymous-context.middleware';

@Module({
  providers: [AnonymousContextMiddleware],
  exports: [AnonymousContextMiddleware],
})
export class AnonymousContextModule {}
