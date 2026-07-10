import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApproveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class RejectDto {
  @ApiProperty({ description: 'Required — the lead is returned to Sales with this note' })
  @IsString() @MinLength(1) note: string;
}
