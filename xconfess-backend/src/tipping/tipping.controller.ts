import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TippingService, TipVerificationResult } from './tipping.service';
import { VerifyTipDto } from './dto/verify-tip.dto';

@Controller('confessions/:id/tips')
export class TippingController {
  constructor(private readonly tippingService: TippingService) {}

  @Get()
  getTips(@Param('id') confessionId: string) {
    return this.tippingService.getTipsByConfessionId(confessionId);
  }

  @Get('stats')
  getTipStats(@Param('id') confessionId: string) {
    return this.tippingService.getTipStats(confessionId);
  }

  @Post('verify')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  verifyTip(
    @Param('id') confessionId: string,
    @Body() dto: VerifyTipDto,
  ): Promise<TipVerificationResult> {
    return this.tippingService.verifyAndRecordTip(confessionId, dto);
  }
}
