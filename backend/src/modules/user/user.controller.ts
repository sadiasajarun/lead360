import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/decorators/public.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { InvitationService } from './invitation.service';
import { AcceptInviteDto, InviteUserDto } from './dtos/user.dtos';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly invitations: InvitationService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Team list (Settings → Team & Roles)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Admins only' })
  team() {
    return this.invitations.listTeam();
  }

  @Get('invitations')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Pending (unaccepted, unexpired) invitations' })
  @ApiResponse({ status: 200, description: 'OK' })
  pending() {
    return this.invitations.listPending();
  }

  @Post('invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invite a user by email; returns the one-time signup link' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already has an account' })
  invite(@Body() dto: InviteUserDto, @CurrentUser('id') adminId: string) {
    return this.invitations.invite(dto.email, adminId, dto.role);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Change a user's role (cannot demote the last active admin)" })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 400, description: 'Last admin / self-demotion' })
  setRole(@Param('id', ParseUUIDPipe) id: string, @Body() body: { role: UserRole }, @CurrentUser('id') adminId: string) {
    return this.invitations.setRole(id, body.role, adminId);
  }

  @Patch(':id/active')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate / deactivate a user (cannot deactivate yourself or the last admin)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 400, description: 'Last admin / self-deactivation' })
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() body: { isActive: boolean }, @CurrentUser('id') adminId: string) {
    return this.invitations.setActive(id, !!body.isActive, adminId);
  }

  @Delete('invitations/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiResponse({ status: 200, description: 'Revoked' })
  @ApiResponse({ status: 404, description: 'Not found' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.revoke(id);
  }

  // --- Public: the invitee has no account yet, so these cannot require auth ---

  @Public()
  @Get('invite/:token')
  @ApiOperation({ summary: 'Validate an invite token and return the invited email' })
  @ApiResponse({ status: 200, description: 'Valid' })
  @ApiResponse({ status: 400, description: 'Used or expired' })
  @ApiResponse({ status: 404, description: 'Invalid token' })
  peek(@Param('token') token: string) {
    return this.invitations.peek(token);
  }

  @Public()
  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept an invitation: set name + password and create the account' })
  @ApiResponse({ status: 201, description: 'Account created — the user can now log in' })
  @ApiResponse({ status: 400, description: 'Weak password / used / expired' })
  @ApiResponse({ status: 404, description: 'Invalid token' })
  accept(@Body() dto: AcceptInviteDto) {
    return this.invitations.accept(dto.token, dto.name, dto.password);
  }
}
