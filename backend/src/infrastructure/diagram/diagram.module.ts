import { Global, Module } from '@nestjs/common';
import { DiagramService } from './diagram.service';

// Global so the generation engine can inject DiagramService without re-importing.
@Global()
@Module({
  providers: [DiagramService],
  exports: [DiagramService],
})
export class DiagramModule {}
