import { Injectable } from '@nestjs/common';
import { BaseService } from '../../core/base/base.service';
import { User } from './user.entity';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService extends BaseService<User> {
  constructor(private readonly users: UserRepository) {
    super(users, 'User');
  }

  findByEmailWithPassword(email: string) {
    return this.users.findByEmailWithPassword(email);
  }

  findByIdWithPassword(id: string) {
    return this.users.findByIdWithPassword(id);
  }
}
