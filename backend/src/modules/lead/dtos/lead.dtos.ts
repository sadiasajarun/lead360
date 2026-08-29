import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus, TemplateType, LossReason, BudgetCurrency, ProjectType, Audience } from '../../../common/enums';

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

  @ApiPropertyOptional({ enum: ProjectType, description: 'How the engine frames the proposal (Template & Setup step)' })
  @IsOptional() @IsEnum(ProjectType) projectType?: ProjectType;
  @ApiPropertyOptional({ enum: Audience, description: 'Who the proposal is written for (Template & Setup step)' })
  @IsOptional() @IsEnum(Audience) audience?: Audience;
  @ApiPropertyOptional({ description: 'Freeform project context — appended to the effective brief' })
  @IsOptional() @IsString() @MaxLength(4000) projectContext?: string;
  @ApiPropertyOptional({ enum: ['phase', 'milestone', 'scope', 'module'], description: 'Override the auto-picked delivery structure; omit for auto' })
  @IsOptional() @IsIn(['phase', 'milestone', 'scope', 'module']) structureModeOverride?: string;

  // --- Procurement (Template & Setup step) — both optional, both default false ---
  @ApiPropertyOptional({ description: 'Hardware/devices are part of this engagement (unlocks the budget equipment schedule)' })
  @IsOptional() @IsBoolean() hardwareProject?: boolean;
  @ApiPropertyOptional({ description: 'A third-party service/supplier is involved (kept internal — never named to the client)' })
  @IsOptional() @IsBoolean() thirdPartyService?: boolean;
  @ApiPropertyOptional({ description: 'Internal note on the hardware / third-party arrangement — shapes the proposal, never quoted verbatim' })
  @IsOptional() @IsString() @MaxLength(4000) procurementNotes?: string;
  @ApiPropertyOptional({ description: 'Delivery/installation window in weeks — ADDED to the software schedule as an on-site phase' })
  @IsOptional() @IsInt() @Min(0) hardwareInstallWeeks?: number;
  @ApiPropertyOptional({ description: 'Warranty cover for supplied hardware — restated in the proposal as our commitment' })
  @IsOptional() @IsString() @MaxLength(2000) hardwareWarranty?: string;
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
