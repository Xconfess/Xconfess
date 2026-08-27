import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionController } from './encryption.controller';
import { EncryptionService } from './encryption.service';

describe('EncryptionController', () => {
  let controller: EncryptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncryptionController],
      providers: [{ provide: EncryptionService, useValue: {} }],
    }).compile();

    controller = module.get<EncryptionController>(EncryptionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
