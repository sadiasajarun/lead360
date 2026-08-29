import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { BLOCK_TYPES, type BlockType } from '../../generation/blocks/block.types';

const TYPES = [...BLOCK_TYPES];

export class ReorderBlocksDto {
  @ApiProperty({ type: [String], description: 'Block ids in the desired order' })
  @IsArray() @IsString({ each: true }) order: string[];
}

export class InsertBlockDto {
  @ApiProperty({ enum: TYPES, description: 'Block type to insert (scaffolded, then edited)' })
  @IsIn(TYPES) type: BlockType;
  @ApiPropertyOptional({ description: 'Insert AFTER this block id; omit to append at the end' })
  @IsOptional() @IsString() afterId?: string;
}

export class ChangeBlockTypeDto {
  @ApiProperty({ enum: TYPES, description: 'New block type (replaces content with a fresh scaffold)' })
  @IsIn(TYPES) type: BlockType;
}
