import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentDelivery } from './document-delivery.entity';
import { DeliveryRepository } from './delivery.repository';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentDelivery])],
  controllers: [DeliveryController],
  providers: [DeliveryRepository, DeliveryService],
})
export class DeliveryModule {}
