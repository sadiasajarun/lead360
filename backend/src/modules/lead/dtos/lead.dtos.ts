import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus, TemplateType, LossReason, BudgetCurrency } from '../../../common/enums';

export class CreateLeadDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() company: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiProperty({ enum: TemplateType }) @IsEnum(TemplateType) template: TemplateType;
  @ApiPropertyOptional({ enum: BudgetCurrency, description: 'BDT only allowed on Local leads; otherwise forced to USD' })
  @IsOptional() @IsEnum(BudgetCurrency) budgetCurrency?: BudgetCurrency;

  @ApiPropertyOptional({ description: 'Deal value in integer minor units (cents)' })
  @IsOptional() @IsInt() @Min(0) valueCents?: number;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class LeadQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiPropertyOptional({ enum: TemplateType }) @IsOptional() @IsEnum(TemplateType) template?: TemplateType;
  @ApiPropertyOptional({ description: 'Free-text search on title/company' })
  @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ description: 'ISO date — leads CREATED on/after this instant' })
  @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ description: 'ISO date — leads CREATED before this instant' })
  @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class MarkLostDto {
  @ApiProperty({ enum: LossReason }) @IsEnum(LossReason) reason: LossReason;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddCommentDto {
  @ApiProperty({ description: 'Comment body (max 4000 chars)' })
  @IsString() @MinLength(1) body: string;
}
