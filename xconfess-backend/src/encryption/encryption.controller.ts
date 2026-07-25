import { Controller, Post, Body } from '@nestjs/common';
import { EncryptionService, EnvelopePayload } from './encryption.service';
import { CreateEncryptionDto } from './dto/create-encryption.dto';

@Controller('encryption')
export class EncryptionController {
  constructor(private readonly encryptionService: EncryptionService) {}

  @Post('encrypt')
  encrypt(@Body() dto: { text: string }) {
    return { encrypted: this.encryptionService.encrypt(dto.text || '') };
  }

  @Post('decrypt')
  decrypt(@Body() dto: { encrypted: EnvelopePayload }) {
    return { decrypted: this.encryptionService.decrypt(dto.encrypted) };
  }
}
