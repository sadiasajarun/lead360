import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';

// Global so any feature module can inject AiService without re-importing.
@Global()
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
