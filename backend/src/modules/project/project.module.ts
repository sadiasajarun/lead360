import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { ProjectListener } from './project.listener';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [TypeOrmModule.forFeature([Project]), LeadModule],
  controllers: [ProjectController],
  providers: [ProjectRepository, ProjectService, ProjectListener],
})
export class ProjectModule {}
