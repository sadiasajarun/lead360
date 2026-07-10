import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module';
import { ProposalModule } from '../proposal/proposal.module';
import { KbModule } from '../kb/kb.module';
import { LeadModule } from '../lead/lead.module';
import { RequirementModule } from '../requirement/requirement.module';
import { UserModule } from '../user/user.module';
import { SettingsModule } from '../settings/settings.module';
import { DeliverablesService } from './deliverables.service';
import { DeliverablesListener } from './deliverables.listener';
import { DeliverablesController } from './deliverables.controller';

// PdfModule + StorageModule are @Global, so they don't need importing here.
// LeadModule is safe to import: leads reach this module through the `lead.approved` EVENT, never by
// importing it back, so there is no cycle.
@Module({
  imports: [SettingsModule, BudgetModule, ProposalModule, KbModule, RequirementModule, UserModule, LeadModule],
  controllers: [DeliverablesController],
  providers: [DeliverablesService, DeliverablesListener],
})
export class DeliverablesModule {}
