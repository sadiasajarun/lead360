import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '../../../common/enums';
import { PASSWORD_MIN, PASSWORD_REGEX } from '../../../common/utils/password-policy';

export class InviteUserDto {
  @ApiProperty({ example: 'new.member@riseuplabs.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.SALES_PM })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'The raw token from the invite link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'Nabil Hasan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Min 8 chars with upper, lower, number and special character' })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must contain an uppercase letter, a lowercase letter, a number and a special character',
  })
  password: string;
}
