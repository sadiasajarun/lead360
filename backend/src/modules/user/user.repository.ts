import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { User } from './user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }

  findById(id: string) {
    return this.qb.findOne({ where: { id } });
  }

  findByEmail(email: string) {
    return this.qb.findOne({ where: { email } });
  }

  // passwordHash is select:false by default; pull it in explicitly for auth.
  findByEmailWithPassword(email: string) {
    return this.qb
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  findByIdWithPassword(id: string) {
    return this.qb
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
  }
}
