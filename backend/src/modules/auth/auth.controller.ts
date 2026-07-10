import {
  Body, Controller, Delete, Get, Patch, Post, Req, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../core/decorators/public.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, UpdateProfileDto, VerifyPasswordDto } from './dto/change-password.dto';
import { SetTokenInterceptor } from './interceptors/set-token.interceptor';
import { RemoveTokenInterceptor } from './interceptors/remove-token.interceptor';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseInterceptors(SetTokenInterceptor)
  @Post('login')
  @ApiOperation({ summary: 'Log in; sets httpOnly cookies' })
  @ApiResponse({ status: 201, description: 'Logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @UseInterceptors(SetTokenInterceptor)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate tokens from the refresh cookie' })
  @ApiResponse({ status: 201, description: 'Rotated' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  refresh(@Req() req: Request) {
    return this.auth.refresh(req.cookies && req.cookies['refresh_token']);
  }

  @Public()
  @UseInterceptors(RemoveTokenInterceptor)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh token + clear auth cookies (works with an expired token)' })
  @ApiResponse({ status: 201, description: 'Logged out' })
  logout(@Req() req: Request) {
    return this.auth.revoke(req.cookies && req.cookies['refresh_token']);
  }

  @Post('verify-password')
  @ApiOperation({ summary: 'Re-authenticate: confirm the current user password (guards destructive bulk actions)' })
  @ApiResponse({ status: 201, description: 'Password valid' })
  @ApiResponse({ status: 401, description: 'Password incorrect' })
  verifyPassword(@CurrentUser() user: { id: string }, @Body() dto: VerifyPasswordDto) {
    return this.auth.verifyPassword(user.id, dto.password);
  }

  @UseInterceptors(SetTokenInterceptor)
  @Post('change-password')
  @ApiOperation({ summary: 'Change own password; revokes other sessions and rotates cookies' })
  @ApiResponse({ status: 201, description: 'Password changed' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthenticated or current password incorrect' })
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user (full profile from DB, not just JWT claims)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }

  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update personal defaults (template, currency, theme, language)' })
  @ApiResponse({ status: 200, description: 'Saved' })
  updatePreferences(@CurrentUser('id') userId: string, @Body() patch: Record<string, unknown>) {
    return this.auth.updatePreferences(userId, patch);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } })) // 2 MB cap
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload own profile photo (PNG/JPG/WebP, max 2 MB)' })
  @ApiResponse({ status: 201, description: 'Stored; returns the refreshed profile' })
  @ApiResponse({ status: 400, description: 'Missing/oversized/non-image file' })
  uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    return this.auth.setAvatar(userId, file);
  }

  @Get('me/avatar')
  @ApiOperation({ summary: 'Stream own profile photo' })
  @ApiResponse({ status: 200, description: 'Image' })
  @ApiResponse({ status: 404, description: 'No photo set' })
  async avatar(@CurrentUser('id') userId: string) {
    const f = await this.auth.getAvatar(userId);
    return new StreamableFile(f.buffer, { type: f.mime });
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove own profile photo' })
  @ApiResponse({ status: 200, description: 'Removed; returns the refreshed profile' })
  removeAvatar(@CurrentUser('id') userId: string) {
    return this.auth.removeAvatar(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile (display name)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(userId, dto.name);
  }
}
