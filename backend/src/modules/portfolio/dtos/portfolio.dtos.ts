import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ResolveStackDto {
  @ApiProperty({ description: 'The client brief / project description' })
  @IsString()
  brief: string;

  @ApiPropertyOptional({ description: 'How many comparable projects to retrieve (3-5 per spec)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  k?: number;
}
