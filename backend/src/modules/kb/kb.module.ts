import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KbDocument } from './kb-document.entity';
import { KbChunk } from './kb-chunk.entity';
import { KbRepository } from './kb.repository';
import { KbService } from './kb.service';
import { KbController } from './kb.controller';
import { EstimateModule } from '../estimate/estimate.module';

@Module({
  imports: [UserModule, TypeOrmModule.forFeature([KbDocument, KbChunk]), EstimateModule],
  controllers: [KbController],
  providers: [KbRepository, KbService],
  exports: [KbService],
})
export class KbModule {}
