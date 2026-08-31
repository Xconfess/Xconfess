import { ApiProperty } from '@nestjs/swagger';

export class StellarContractIdsDto {
  @ApiProperty({
    description: 'Deployed confession-anchor Soroban contract ID',
    nullable: true,
    example: 'CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB',
  })
  confessionAnchor: string | null;

  @ApiProperty({
    description: 'Deployed reputation-badges Soroban contract ID',
    nullable: true,
    example: 'CDAN4HZHY6XNQR3TRPLPJKVKNURVMMQMF7XNZ6AUNJNFLR77J4DNAEYI',
  })
  reputationBadges: string | null;

  @ApiProperty({
    description: 'Deployed tipping-system Soroban contract ID',
    nullable: true,
    example: 'CC74UWNAAYDTPEPVKR4CPANWJSF6GI2PCI7BLN6M46KB6CSQYVYLHIWM',
  })
  tippingSystem: string | null;
}

export class DeploymentMetadataStatusDto {
  @ApiProperty({
    description: 'True when deployment metadata was successfully loaded from disk',
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
    description: 'Whether the deployment metadata is stale and should be refreshed',
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
