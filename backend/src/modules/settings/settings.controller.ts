import {
  Body, Controller, Delete, Get, Param, Post, Put, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { Public } from '../../core/decorators/public.decorator';
import { NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'All organisation settings (defaults merged under stored overrides)' })
  @ApiResponse({ status: 200, description: 'OK' })
  all() {
    return this.settings.all();
  }

  @Post('currency/sync')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Fetch the live USD→BDT rate and store it' })
  @ApiResponse({ status: 201, description: 'Synced' })
  @ApiResponse({ status: 400, description: 'FX provider unreachable or returned no rate' })
  syncFx(@CurrentUser('id') adminId: string) {
    return this.settings.syncFx(adminId);
  }

  @Post('branding/logo')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Replace the company logo used across the app and every generated PDF' })
  @ApiResponse({ status: 201, description: 'Stored; returns the branding section' })
  @ApiResponse({ status: 400, description: 'Missing/oversized/non-image file' })
  setLogo(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }, @CurrentUser('id') adminId: string) {
    return this.settings.setLogo(file, adminId);
  }

  // Public: client-facing deliverable views render the logo without a session.
  @Public()
  @Get('branding/logo')
  @ApiOperation({ summary: 'Stream the company logo (404 when the bundled default is in use)' })
  @ApiResponse({ status: 200, description: 'Image' })
  @ApiResponse({ status: 404, description: 'No custom logo set' })
  async logo() {
    const f = await this.settings.getLogo();
    if (!f) throw new NotFoundException('No custom logo set');
    return new StreamableFile(f.buffer, { type: f.mime });
  }

  @Delete('branding/logo')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove the custom logo and fall back to the bundled Riseup mark' })
  @ApiResponse({ status: 200, description: 'Removed' })
  removeLogo(@CurrentUser('id') adminId: string) {
    return this.settings.removeLogo(adminId);
  }

  @Get(':section')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'One settings section' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'Unknown section' })
  get(@Param('section') section: string) {
    return this.settings.get(section);
  }

  @Put(':section')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a settings section (unknown keys are dropped)' })
  @ApiResponse({ status: 200, description: 'Saved' })
  @ApiResponse({ status: 400, description: 'Unknown section or invalid value' })
  update(
    @Param('section') section: string,
    @Body() patch: Record<string, unknown>,
    @CurrentUser('id') adminId: string,
  ) {
    return this.settings.update(section, patch, adminId);
  }
}
