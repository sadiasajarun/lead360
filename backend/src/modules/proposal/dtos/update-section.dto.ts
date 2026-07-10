import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString } from 'class-validator';

export class UpdateSectionDto {
  @ApiProperty({ description: 'Section key, e.g. executiveSummary' })
  @IsString()
  key: string;

  // Shape-preserving: a string, string[], or an array of row objects — validated by the UI, stored as-is.
  @ApiProperty({ description: 'New section value (keeps the section\'s original shape)' })
  @IsDefined()
  value: unknown;
}
