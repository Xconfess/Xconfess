import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { EncryptionController } from './encryption.controller';

@Global()
@Module({
  controllers: [EncryptionController],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
