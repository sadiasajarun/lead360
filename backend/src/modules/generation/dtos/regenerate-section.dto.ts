import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RegenerateSectionDto {
  @ApiProperty({ description: 'The section key to regenerate (e.g. executiveSummary)' })
  @IsString()
  key: string;

  @ApiPropertyOptional({ description: 'Plain-English instruction to steer the rewrite' })
  @IsOptional()
  @IsString()
  instruction?: string;
}
