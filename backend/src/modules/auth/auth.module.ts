import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RefreshToken } from './refresh-token.entity';
import { UserModule } from '../user/user.module';
import { TokenModule } from '../../infrastructure/token/token.module';
import { SetTokenInterceptor } from './interceptors/set-token.interceptor';

@Module({
  imports: [ConfigModule, PassportModule, TokenModule, UserModule, TypeOrmModule.forFeature([RefreshToken])],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SetTokenInterceptor],
})
export class AuthModule {}
