import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertRequirementDto {
  @ApiPropertyOptional({ description: 'Pasted brief text' })
  @IsOptional() @IsString() sourceText?: string;

  @ApiPropertyOptional({ description: 'Uploaded file refs [{ name, key, mime }]' })
  @IsOptional() @IsArray() files?: { name: string; key: string; mime: string }[];
}

export class ResolveQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'confirmed'] })
  @IsOptional() @IsIn(['open', 'confirmed']) status?: 'open' | 'confirmed';

  @ApiPropertyOptional({ description: "The client's answer to this query" })
  @IsOptional() @IsString() @MaxLength(2000) answer?: string;
}
