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
  @ApiProperty({ description: 'Effective man-days = hoursPerDay × workingDays / 8 (fractional)' })
  @IsNumber() @Min(0) days: number;
  @ApiPropertyOptional({ description: 'Daily commitment in hours (1..8; 8 = full-time). Derives days.' })
  @IsOptional() @IsNumber() @Min(0) hoursPerDay?: number;
  @ApiPropertyOptional({ description: 'Calendar days the role is staffed (timeline proxy). Derives days.' })
  @IsOptional() @IsInt() @Min(0) workingDays?: number;
  @ApiProperty({ description: 'Day rate in integer minor units (cents)' })
  @IsInt() @Min(0) dayRateCents: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() optional?: boolean;
}

/** A purchased item: hardware, device, licence or on-site installation. Costed by qty x unit price. */
export class BudgetEquipmentInput {
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional({ description: 'Unit of measure as quoted — pcs, lot, job, node.' })
  @IsOptional() @IsString() uom?: string;
  @ApiProperty() @IsInt() @Min(0) qty: number;
  @ApiProperty({ description: 'Unit price in integer minor units (cents)' })
  @IsInt() @Min(0) unitPriceCents: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** Confirmed rows + terms from a supplier-quotation import, after the rep has reviewed the preview. */
export class CommitVendorQuoteDto {
  @ApiProperty({ type: [BudgetEquipmentInput] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetEquipmentInput)
  rows: BudgetEquipmentInput[];

  @ApiPropertyOptional({ description: 'Delivery/installation window in weeks — ADDED to the software schedule' })
  @IsOptional() @IsInt() @Min(0) installWeeks?: number;

  @ApiPropertyOptional({ description: 'Warranty cover, restated in the proposal as our commitment' })
  @IsOptional() @IsString() warranty?: string;

  @ApiPropertyOptional({ description: 'VAT/tax on the quoted equipment, appended as a final schedule line' })
  @IsOptional() @IsInt() @Min(0) vatCents?: number;
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

  // Omitted entirely => equipment is left untouched (an editor that does not manage it cannot wipe it).
  @ApiPropertyOptional({ type: [BudgetEquipmentInput] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetEquipmentInput)
  equipment?: BudgetEquipmentInput[];
}
