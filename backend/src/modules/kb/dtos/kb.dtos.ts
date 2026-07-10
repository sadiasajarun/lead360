import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class IngestDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() sourcePath: string;
  @ApiProperty({ description: 'Extracted document text' }) @IsString() text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() template?: string;
}

export class SearchDto {
  @ApiProperty() @IsString() q: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) limit?: number;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional({ description: 'New display name for the document' })
  @IsOptional() @IsString() @IsNotEmpty() title?: string;

  @ApiPropertyOptional({ description: 'Notion-style tags (replaces the full set; max 10, 24 chars each)' })
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class PurgeTrashDto {
  @ApiPropertyOptional({ description: 'Specific trashed document ids to permanently delete' })
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) ids?: string[];

  @ApiPropertyOptional({ description: 'true = empty the whole trash' })
  @IsOptional() @IsBoolean() all?: boolean;
}
