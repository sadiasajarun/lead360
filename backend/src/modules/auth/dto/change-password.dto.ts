import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyPasswordDto {
  @ApiProperty({ description: "The user's current password (re-authentication)" })
  @IsString()
  @MinLength(1)
  password: string;
}

export class UpdateProfileDto {
  @ApiProperty({ description: 'Display name', maxLength: 80 })
  @IsString()
  @MinLength(1)
  name: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'Lead360!sales' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({ example: 'NewStrong!pass1', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
