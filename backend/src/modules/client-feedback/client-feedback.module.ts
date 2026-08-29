import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientFeedback } from './client-feedback.entity';
import { Lead } from '../lead/lead.entity';
import { ClientFeedbackRepository } from './client-feedback.repository';
import { ClientFeedbackService } from './client-feedback.service';
import { ClientFeedbackController } from './client-feedback.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClientFeedback, Lead])],
  controllers: [ClientFeedbackController],
  providers: [ClientFeedbackRepository, ClientFeedbackService],
  exports: [ClientFeedbackService],
})
export class ClientFeedbackModule {}
