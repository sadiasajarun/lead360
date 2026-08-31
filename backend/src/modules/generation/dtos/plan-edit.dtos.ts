import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** One staffed role within a phase. Rates come from the rate card — never from the client. */
export class PlanMemberDto {
  @ApiProperty({ example: 'Backend Developer' })
  @IsString()
  @MaxLength(120)
  role: string;

  @ApiProperty({ example: 'senior' })
  @IsString()
  @MaxLength(40)
  seniority: string;

  @ApiProperty({ example: 2, description: 'Head count on this role in this phase.' })
  @IsInt()
  @Min(1)
  @Max(50)
  units: number;

  @ApiProperty({ example: 8, description: 'Daily commitment in hours — 8 is full time.' })
  @IsNumber()
  @Min(0.5)
  @Max(12)
  hoursPerDay: number;

  @ApiProperty({ example: 'Engineering' })
  @IsString()
  @MaxLength(80)
  department: string;

  @ApiPropertyOptional({ description: 'Per-day rate in minor units. Omitted keeps the rate already resolved.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  dayRateCents?: number;
}

export class PlanPhaseDto {
  @ApiProperty({ example: 'Core Build' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'Attendance capture and device integration.' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  focus?: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(52)
  weeks: number;

  @ApiPropertyOptional({ description: 'Hold this duration through future regenerations. Set automatically when the weeks are edited.' })
  @IsOptional()
  @IsBoolean()
  pinnedWeeks?: boolean;

  @ApiProperty({ type: [PlanMemberDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanMemberDto)
  team: PlanMemberDto[];
}

/** A full replacement of the plan's phases. The budget and the proposal's money blocks follow deterministically. */
export class UpdatePlanDto {
  @ApiProperty({ type: [PlanPhaseDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlanPhaseDto)
  phases: PlanPhaseDto[];
}
