import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Seniority } from '../../../common/enums';

export class BudgetLineInput {
  @ApiPropertyOptional() @IsOptional() @IsString() milestoneName?: string;
  @ApiProperty() @IsString() department: string;
  @ApiProperty() @IsString() role: string;
  @ApiProperty({ enum: Seniority }) @IsEnum(Seniority) seniority: Seniority;
  @ApiProperty() @IsInt() @Min(0) units: number;
  @ApiProperty() @IsInt() @Min(0) days: number;
  @ApiProperty({ description: 'Day rate in integer minor units (cents)' })
  @IsInt() @Min(0) dayRateCents: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() optional?: boolean;
}

export class UpdateBudgetDto {
  // Optimistic lock — the version the client loaded. Stale save -> 409.
  @ApiProperty() @IsInt() version: number;

  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() contingencyPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() vatPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeOptional?: boolean;

  @ApiProperty({ type: [BudgetLineInput] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineInput)
  lines: BudgetLineInput[];
}
