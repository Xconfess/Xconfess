import { IsString, IsNotEmpty, IsObject, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSavedSearchDto {
  @ApiProperty({
    description: 'Name of the search preset',
    example: 'My Favorite Work Stress Search',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ description: 'Filter object (same as SearchConfessionDto)' })
  @IsObject()
  @IsNotEmpty()
  filters: any;
}
