import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() summary?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() category?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() techStack?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() coverKey?: string;
  @ApiPropertyOptional({ description: 'Live site or riseuplabs.com project URL' })
  @IsOptional() @IsUrl({ require_protocol: true }) link?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class ProjectQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tech?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
}
