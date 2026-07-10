import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { BaseService } from './base.service';

/** HTTP CRUD base with Swagger. Feature controllers extend and override as needed. */
export abstract class BaseController<T extends BaseEntity, CreateDto = unknown, UpdateDto = unknown> {
  constructor(protected readonly service: BaseService<T>) {}

  @Get()
  @ApiOperation({ summary: 'List all' })
  @ApiResponse({ status: 200, description: 'OK' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one by id' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findByIdOrFail(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create' })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateDto) {
    return this.service.create(dto as never);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDto) {
    return this.service.update(id, dto as never);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft delete' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
