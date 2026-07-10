import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Seniority } from '../../../common/enums';

export class CreateRateCardDto {
  @ApiProperty() @IsString() department: string;
  @ApiProperty() @IsString() role: string;
  @ApiProperty({ enum: Seniority }) @IsEnum(Seniority) seniority: Seniority;
  @ApiProperty({ description: 'Day rate in integer minor units (cents)' })
  @IsInt() @Min(0) dayRateCents: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
}
