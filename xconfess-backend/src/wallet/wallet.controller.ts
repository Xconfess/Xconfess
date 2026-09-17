import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimitGuard } from '../auth/guard/rate-limit.guard';
import { RateLimit } from '../auth/guard/rate-limit.decorator';
import { RegisterWalletDto } from './dto/register-wallet.dto';
import { SaveBackupDto } from './dto/save-backup.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly service: WalletService) {}
  @Get() get(@Req() req: any) { return this.service.getPrimary(Number(req.user.id ?? req.user.sub)); }
  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit(5, 300) register(@Req() req: any, @Body() dto: RegisterWalletDto) { return this.service.register(Number(req.user.id ?? req.user.sub), dto); }
  @Post('fund/testnet')
  @UseGuards(RateLimitGuard)
  @RateLimit(1, 3600) fundTestnet(@Req() req: any) { return this.service.fundTestnet(Number(req.user.id ?? req.user.sub)); }
  @Post('backup')
  @UseGuards(RateLimitGuard)
  @RateLimit(5, 3600) saveBackup(@Req() req: any, @Body() dto: SaveBackupDto) { return this.service.saveBackup(Number(req.user.id ?? req.user.sub), dto); }
  @Get('backup')
  @UseGuards(RateLimitGuard)
  @RateLimit(20, 3600) getBackup(@Req() req: any) { return this.service.getBackup(Number(req.user.id ?? req.user.sub)); }
}

