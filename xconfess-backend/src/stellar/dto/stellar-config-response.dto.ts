import { ApiProperty } from '@nestjs/swagger';

export class StellarContractIdsDto {
  @ApiProperty({
    description: 'Deployed confession-anchor Soroban contract ID',
    nullable: true,
    example: 'CBFR2MDZBQPTNBIJCT32MTDDQLW2AQNDWNO777F3QT6ANYKTHETQZWD3',
  })
  confessionAnchor: string | null;

  @ApiProperty({
    description: 'Deployed reputation-badges Soroban contract ID',
    nullable: true,
    example: 'CDD7WPESW54SN6YTXY7PH6JLG6S4MWNREHN5FD6XENAITEDOVLWKIQTC',
  })
  reputationBadges: string | null;

  @ApiProperty({
    description: 'Deployed tipping-system Soroban contract ID',
    nullable: true,
    example: 'CAJK27UHTBUGQFUMN5TG5LOQXYODT6NHOY7Z5DVRRMR7CZ4SCIZUE5A3',
  })
  tippingSystem: string | null;
}

export class DeploymentMetadataStatusDto {
  @ApiProperty({
    description:
      'True when deployment metadata was successfully loaded from disk',
    example: true,
  })
  loaded: boolean;

  @ApiProperty({
    description: 'UTC timestamp from the deployment metadata file',
    nullable: true,
    example: '2026-05-21T12:34:56Z',
  })
  generatedAtUtc: string | null;

  @ApiProperty({
    description:
      'Whether the deployment metadata is stale and should be refreshed',
    example: false,
  })
  isStale: boolean;

  @ApiProperty({
    description: 'Days since the deployment metadata was generated',
    nullable: true,
    example: 7,
  })
  ageDays: number | null;

  @ApiProperty({
    description: 'Error message when deployment metadata could not be loaded',
    nullable: true,
    example: 'Deployment metadata file not found',
  })
  loadError: string | null;
}

/** Safe, public Stellar deployment summary for diagnostics (no secrets). */
export class StellarConfigResponseDto {
  @ApiProperty({
    description: 'Configured Stellar network',
    enum: ['testnet', 'mainnet'],
    example: 'testnet',
  })
  network: string;

  @ApiProperty({
    description: 'Horizon REST base URL for the configured network',
    example: 'https://horizon-testnet.stellar.org',
  })
  horizonUrl: string;

  @ApiProperty({
    description: 'Soroban RPC base URL for the configured network',
    example: 'https://soroban-rpc-testnet.stellar.org',
  })
  sorobanRpcUrl: string;

  @ApiProperty({ type: StellarContractIdsDto })
  contractIds: StellarContractIdsDto;

  @ApiProperty({ type: DeploymentMetadataStatusDto })
  deploymentMetadata: DeploymentMetadataStatusDto;
}

export class StellarHorizonDiagnosticsDto {
  @ApiProperty({
    description: 'Reachability state for the configured Horizon endpoint',
    enum: ['ok', 'warning'],
    example: 'ok',
  })
  status: 'ok' | 'warning';

  @ApiProperty({
    description: 'Latency for the lightweight Horizon ping in milliseconds',
    nullable: true,
    example: 84,
  })
  latencyMs: number | null;

  @ApiProperty({
    description: 'UTC timestamp for the latest Horizon ping attempt',
    example: '2026-06-18T01:30:00.000Z',
  })
  checkedAt: string;

  @ApiProperty({
    description: 'Error message when Horizon could not be reached',
    nullable: true,
    example: 'connect ETIMEDOUT',
  })
  error: string | null;
}

export class StellarDiagnosticsResponseDto extends StellarConfigResponseDto {
  @ApiProperty({ type: StellarHorizonDiagnosticsDto })
  horizon: StellarHorizonDiagnosticsDto;
}
