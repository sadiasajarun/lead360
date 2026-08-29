import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertRequirementDto {
  @ApiPropertyOptional({ description: 'Extracted document text (supporting detail)' })
  @IsOptional() @IsString() sourceText?: string;

  @ApiPropertyOptional({ description: "The rep's typed requirements — top priority; shapes the proposal" })
  @IsOptional() @IsString() additionalRequirements?: string;

  @ApiPropertyOptional({ description: 'Uploaded file refs [{ name, key, mime }]' })
  @IsOptional() @IsArray() files?: { name: string; key: string; mime: string }[];
}

export class ResolveQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'confirmed'] })
  @IsOptional() @IsIn(['open', 'confirmed']) status?: 'open' | 'confirmed';

  @ApiPropertyOptional({ description: "The client's answer to this query (text, or the chosen option for a single-select)" })
  @IsOptional() @IsString() @MaxLength(2000) answer?: string;

  @ApiPropertyOptional({ description: 'Selected options for a multi-select query', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) answers?: string[];
}
