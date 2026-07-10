import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Invitation } from './invitation.entity';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { InvitationService } from './invitation.service';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Invitation])],
  controllers: [UserController],
  providers: [UserRepository, UserService, InvitationService],
  exports: [UserService, InvitationService],
})
export class UserModule {}
