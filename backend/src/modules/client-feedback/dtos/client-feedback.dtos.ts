import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClientFeedbackDto {
  @ApiProperty({ description: "A single client feedback point to apply on the next regeneration." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;
}
