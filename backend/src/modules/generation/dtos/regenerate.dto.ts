import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegenerateDto {
  @ApiPropertyOptional({
    example: 'Tighten the executive summary and add a phased rollout section.',
    description: 'Optional plain-English revision instructions applied on top of the RAG-grounded draft.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;
}
