import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RegenerateProposalDto {
  @ApiPropertyOptional({ description: 'Plain-English change, e.g. "tighten the exec summary"' })
  @IsOptional() @IsString() prompt?: string;

  @ApiPropertyOptional({ description: 'Limit regeneration to one section (delta regen)' })
  @IsOptional() @IsString() section?: string;
}
