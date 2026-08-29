import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** A free-text question about a generated proposal — answered read-only from the saved decision record. */
export class AskProposalDto {
  @ApiProperty({
    example: 'Why is the budget $95k and why 3 phases instead of 5?',
    description: 'A question about the proposal, budget, timeline, team or the reasoning behind them (English or Bangla).',
    maxLength: 1000,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  question: string;
}
