import { Controller, Post, Body } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { EnvelopePayload } from './encryption.service';

@Controller('encryption')
export class EncryptionController {
  constructor(private readonly encryptionService: EncryptionService) {}

  @Post('encrypt')
  encrypt(@Body() dto: { text: string }) {
    return { encrypted: this.encryptionService.encrypt(dto.text || '') };
  }

  @Post('decrypt')
  decrypt(@Body() dto: EnvelopePayload) {
    return { decrypted: this.encryptionService.decrypt(dto) };
  }
}
