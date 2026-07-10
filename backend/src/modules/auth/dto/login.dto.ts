import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'farah.karim@riseuplabs.com' })
  @IsEmail()
  email: string;

  /**
   * Deliberately NOT length-validated.
   *
   * Login checks an existing credential; it does not set one. A `@MinLength` here made a short
   * wrong password fail with 400 (validation) while a long wrong password failed with 401 — a
   * length oracle — and would lock out any account whose password predates the current policy.
   * Password strength is enforced where passwords are CREATED (see common/utils/password-policy.ts).
   */
  @ApiProperty({ example: 'Lead360!sales' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
