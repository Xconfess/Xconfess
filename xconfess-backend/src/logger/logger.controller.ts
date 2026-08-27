import { Controller } from '@nestjs/common';
import { AppLogger } from './logger.service';

@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: AppLogger) {}

  // Logger controller - AppLogger is a logging service, not a CRUD service
  // If you need log management endpoints, implement them here
}
