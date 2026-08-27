import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  STELLAR_INVOKE_ALLOWED_OPERATIONS,
  StellarInvocationOperation,
} from '../stellar-invocation-policy';

/** Operations permitted via POST /stellar/invoke-contract (server-signed). */
export class InvokeContractDto {
  @ApiProperty({
    enum: STELLAR_INVOKE_ALLOWED_OPERATIONS,
    description: 'Allowlisted Soroban operation',
  })
  @IsIn([...STELLAR_INVOKE_ALLOWED_OPERATIONS])
  operation: StellarInvocationOperation;

  @ApiProperty({
    description:
      '32-byte confession hash as 64 hex characters (anchor_confession only)',
    required: false,
  })
  @ValidateIf((o: InvokeContractDto) => o.operation === 'anchor_confession')
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'confessionHash must be 64 hexadecimal characters',
  })
  confessionHash?: string;

  @ApiProperty({
    description: 'Unix-style timestamp as u64 (anchor_confession only)',
    required: false,
  })
  @ValidateIf((o: InvokeContractDto) => o.operation === 'anchor_confession')
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  timestamp?: number;

  @ApiProperty({
    description: 'Must equal the public key of STELLAR_SERVER_SECRET',
  })
  @IsString()
  @IsNotEmpty()
  sourceAccount: string;
}
