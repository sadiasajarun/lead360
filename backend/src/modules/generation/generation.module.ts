import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Generation } from './generation.entity';
import { Feedback } from './feedback.entity';
import { LearningSnapshot } from './learning-snapshot.entity';
import { GenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';
import { UnderstandService } from './engine/understand.service';
import { DecideService } from './engine/decide.service';
import { EngineService } from './engine/engine.service';
import { ModuleService } from './engine/module.service';
import { GenerationController } from './generation.controller';
import { GenerationStatsController } from './generation-stats.controller';
import { LeadModule } from '../lead/lead.module';
import { RequirementModule } from '../requirement/requirement.module';
import { ProposalModule } from '../proposal/proposal.module';
import { KbModule } from '../kb/kb.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BudgetModule } from '../budget/budget.module';
import { RateCardModule } from '../rate-card/rate-card.module';
import { EstimateModule } from '../estimate/estimate.module';
import { ClientFeedbackModule } from '../client-feedback/client-feedback.module';
import { ProjectCaseModule } from '../project-case/project-case.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    // Generation owns Feedback (OneToMany) + LearningSnapshot — all must be registered so
    // autoLoadEntities resolves the Generation#feedback inverse relation.
    TypeOrmModule.forFeature([Generation, Feedback, LearningSnapshot]),
    LeadModule,
    RequirementModule,
    ProposalModule,
    KbModule,
    PortfolioModule,
    BudgetModule,
    RateCardModule,
    EstimateModule,
    ClientFeedbackModule,
    ProjectCaseModule,
    SettingsModule,
  ],
  controllers: [GenerationController, GenerationStatsController],
  providers: [GenerationRepository, GenerationService, UnderstandService, DecideService, EngineService, ModuleService],
})
export class GenerationModule {}
