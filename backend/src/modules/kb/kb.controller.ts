import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, StreamableFile, UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { KbService } from './kb.service';
import { UserService } from '../user/user.service';
import { ExtractableFile } from '../../common/utils/extract-text.util';
import { IngestDto, PurgeTrashDto, SearchDto, UpdateDocumentDto } from './dtos/kb.dtos';

@ApiTags('kb')
@Controller('kb')
export class KbController {
  constructor(
    private readonly kb: KbService,
    private readonly users: UserService,
  ) {}

  @Get('documents')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List the Riseup Proposal & Budget Database catalog (Projects > Database tab)' })
  @ApiResponse({ status: 200, description: 'OK' })
  documents() {
    return this.kb.listDocuments();
  }

  @Get('documents/:id/download')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download a stored document (deliverables); 404 for catalog-only refs' })
  @ApiResponse({ status: 200, description: 'File' })
  @ApiResponse({ status: 404, description: 'No stored file' })
  async download(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.kb.getFile(id);
    return new StreamableFile(f.buffer, {
      type: f.mime,
      disposition: `attachment; filename="${encodeURIComponent(f.filename)}"`,
    });
  }

  @Get('documents/:id/view')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'View a stored document inline (PDF opens in browser)' })
  @ApiResponse({ status: 200, description: 'File' })
  @ApiResponse({ status: 404, description: 'No stored file' })
  async view(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.kb.getFile(id);
    return new StreamableFile(f.buffer, {
      type: f.mime,
      disposition: `inline; filename="${encodeURIComponent(f.filename)}"`,
    });
  }

  @Post('documents/upload')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } })) // 25 MB cap
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add a document to the Database (stored + downloadable + embedded for RAG)' })
  @ApiResponse({ status: 201, description: 'Stored + indexed' })
  @ApiResponse({ status: 400, description: 'No file' })
  async upload(
    @UploadedFile() file: ExtractableFile,
    @Body('category') category: string,
    @Body('section') section: string,
    @CurrentUser('id') userId?: string,
    @Body('name') name?: string,
  ) {
    // Owner column = who added the doc (JWT carries no name, so resolve it here).
    const owner = userId ? (await this.users.findByIdOrFail(userId).catch(() => null))?.name : undefined;
    return this.kb.uploadDocument(file, category || 'Global', section || 'Proposal', name, owner);
  }

  @Patch('documents/:id')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a Database document: rename and/or set tags' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentDto) {
    return this.kb.updateDocument(id, dto);
  }

  @Delete('documents/:id')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Move a document to Trash (30-day retention; knowledge removed from RAG immediately)' })
  @ApiResponse({ status: 200, description: 'Trashed' })
  @ApiResponse({ status: 404, description: 'Not found' })
  trash(@Param('id', ParseUUIDPipe) id: string) {
    return this.kb.deleteDocument(id);
  }

  // --- Trash (Settings > Trash) ---

  @Get('trash')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List trashed documents with days-left until permanent removal' })
  @ApiResponse({ status: 200, description: 'OK' })
  listTrash() {
    return this.kb.listTrash();
  }

  @Post('trash/:id/restore')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Restore a trashed document (re-indexes it into RAG from the stored file)' })
  @ApiResponse({ status: 201, description: 'Restored' })
  @ApiResponse({ status: 404, description: 'Not in trash' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.kb.restoreDocument(id);
  }

  @Delete('trash/:id')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Permanently delete one trashed document (file + record; irreversible)' })
  @ApiResponse({ status: 200, description: 'Purged' })
  @ApiResponse({ status: 404, description: 'Not found' })
  purgeOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kb.purgeDocument(id);
  }

  @Post('trash/purge')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Permanently delete selected trashed documents ({ids}) or everything ({all:true})' })
  @ApiResponse({ status: 201, description: 'Purged' })
  @ApiResponse({ status: 400, description: 'Neither ids nor all given' })
  purge(@Body() dto: PurgeTrashDto) {
    if (dto.all) return this.kb.purgeAllTrash();
    if (dto.ids?.length) return this.kb.purgeMany(dto.ids);
    return { purged: 0, of: 0 };
  }

  @Post('ingest')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ingest a Riseup document into the RAG corpus (parse -> chunk -> store)' })
  @ApiResponse({ status: 201, description: 'Ingested' })
  ingest(@Body() dto: IngestDto) {
    return this.kb.ingest(dto);
  }

  @Post('search')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Retrieve relevant chunks for grounding' })
  @ApiResponse({ status: 200, description: 'OK' })
  search(@Body() dto: SearchDto) {
    return this.kb.search(dto.q, dto.limit);
  }
}
