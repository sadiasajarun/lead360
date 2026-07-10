import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import { User } from '../modules/user/user.entity';
import { KbDocument } from '../modules/kb/kb-document.entity';
import { RateCard } from '../modules/rate-card/rate-card.entity';
import { UserRole, Seniority } from '../common/enums';

// Riseup seniority-tiered day-rate card (USD, integer cents). Budgets pre-fill from these.
const RATE_CARD: { department: string; role: string; rates: Record<Seniority, number> }[] = [
  { department: 'Management', role: 'Project Manager', rates: { [Seniority.SENIOR]: 40000, [Seniority.MID]: 30000, [Seniority.JUNIOR]: 20000 } },
  { department: 'Design', role: 'UI/UX Designer', rates: { [Seniority.SENIOR]: 35000, [Seniority.MID]: 25000, [Seniority.JUNIOR]: 18000 } },
  { department: 'Development', role: 'Backend Engineer', rates: { [Seniority.SENIOR]: 45000, [Seniority.MID]: 32000, [Seniority.JUNIOR]: 22000 } },
  { department: 'Development', role: 'Frontend Engineer', rates: { [Seniority.SENIOR]: 42000, [Seniority.MID]: 30000, [Seniority.JUNIOR]: 20000 } },
  { department: 'Development', role: 'Mobile Engineer', rates: { [Seniority.SENIOR]: 45000, [Seniority.MID]: 32000, [Seniority.JUNIOR]: 22000 } },
  { department: 'QA', role: 'QA Engineer', rates: { [Seniority.SENIOR]: 30000, [Seniority.MID]: 22000, [Seniority.JUNIOR]: 15000 } },
  { department: 'DevOps', role: 'DevOps Engineer', rates: { [Seniority.SENIOR]: 48000, [Seniority.MID]: 35000, [Seniority.JUNIOR]: 24000 } },
];

// Riseup Proposal & Budget Database catalog (Projects > Database tab). Real Riseup documents only —
// never template-author (Potential Inc) sample data. Mirrors the approved design prototype library.
const KB_CATALOG: Record<string, Record<string, string[]>> = {
  Agency: {
    'Client requirement': [
      'Hummm - UX_UI Estimation (Final) - Dev Draft.pdf',
      'KHDMETI - SCOPE RECOMMENDATION v2.pdf',
      'Sentinel Risk Intelligence Labs eyes-on-glass Swarm & System Functional Requirements.pdf',
      'Kwando - Calendar Visibility & Overlay Logic.docx',
      'Kwando Technical Scope - Dev.xlsx',
      'Kwando Technical Scope admin console requirements - Dev.xlsx',
      'Lightweight webpage _ Partiful flow.pptx',
    ],
    Proposal: [
      'Eyes_on_Glass_Cloud_Deployment_Technical_and_Financial_Proposal.docx',
      'Humm_Technical_and_Financial_Proposal_iOS_Development.docx',
      'KHDMETI_Technical_and_Financial_Proposal with updated budget.docx',
      'Kwando_iOS_MVP_Development_Maintenance_Technical_and_Financial_Proposal_Rev_Admin_Laravel(Updated).docx',
    ],
  },
  'Design Portfolio': {
    Proposal: ['Untitled document (1).pdf', 'Untitled document.pdf'],
  },
  Global: {
    'Client requirement': [
      'Blitz Clone Proposal.pdf',
      'PROJECT OVERVIEW- Steel Welding.docx',
      'Scope of Work_Survivor Alliance Moodle Localization Project.docx',
      'TAD Gulf Website - SEO & Sitemap (1).xlsx',
      'Tournament_System_24_7_Functionality_Brief.pdf',
    ],
    Proposal: [
      'Blitz_Clone_Technical_Proposal_Games_Scope.docx',
      'Moodle_Multilingual_Course_Build_Technical_Proposal.docx',
      'Steel_Welding_VR_Training_Technical_Proposal_Revised_Duration_Options.docx',
      'TAD_Gulf_Website_Technical_Proposal_Updated.docx',
    ],
    Budget: [
      'Blitz Clone Budget.xlsx',
      'Steel_Welding_VR_Training_Technical_Proposal Budget V2.xlsx',
      'Survivor Alliance Moodle Localization Project Budget.xlsx',
      'TAD Gulf Website - SEO & Sitemap (1).xlsx',
    ],
  },
  Local: {
    'Client requirement': [
      'AI-Based Early Warning System ToR.pdf',
      'BRAC_Online_Module_Summary.pdf',
      'BRAC_Online_Module_ToR.pdf',
      'Terms of reference-E-Learning.pdf',
      'ToR - Strengthening IPEMIS.pdf',
    ],
    Proposal: [
      'Agvisely_AI_Early_Warning_Technical_Proposal.docx',
      'BRAC_Online_Module_Development_Technical_Proposal_Updated.docx',
      'IPEMIS_Technical_Proposal_Updated_Methodology (1).docx',
      'Technical_Proposal_E_Learning_Digital_Accessibility_Disability_Inclusion.docx',
    ],
    Budget: [
      'Agvisely_AI_Early_Warning_ budget.xlsx',
      'Develop and Deliver Two E-Learning Courses on Digital Accessibility and Disability Budget.xlsx',
      'Online Module Development Budget.xlsx',
      'Technical Support for Strengthening, and Enhancement of Integrated Primary Education Management Information System (IPEMIS)- Budget.xlsx',
    ],
  },
};

const extOf = (name: string) => (name.split('.').pop() || 'file').toLowerCase();

// Idempotent seed. Reads test users from _fixtures.yaml (single source of truth) and upserts them.
// Passwords are bcrypt-hashed here — never stored in plain text. Run: npm run seed
type FixtureUser = { key: string; name: string; email: string; password: string; role: string };

async function run() {
  const fixturesPath = join(
    __dirname,
    '../../../.claude-project/user_stories/_fixtures.yaml',
  );
  const fixtures = yaml.load(readFileSync(fixturesPath, 'utf8')) as { users: FixtureUser[] };

  await dataSource.initialize();
  const repo = dataSource.getRepository(User);

  for (const u of fixtures.users ?? []) {
    const existing = await repo.findOne({ where: { email: u.email } });
    if (existing) {
      console.log(`skip (exists): ${u.email}`);
      continue;
    }
    const user = repo.create({
      name: u.name,
      email: u.email,
      passwordHash: await bcrypt.hash(u.password, 10),
      role: u.role as UserRole,
      isActive: true,
    });
    await repo.save(user);
    console.log(`created: ${u.email} (${u.role})`);
  }

  // --- KB catalog (Riseup Proposal & Budget Database) ---
  const kbRepo = dataSource.getRepository(KbDocument);
  let kbCreated = 0;
  for (const [category, sections] of Object.entries(KB_CATALOG)) {
    for (const [section, files] of Object.entries(sections)) {
      for (const title of files) {
        const existing = await kbRepo.findOne({ where: { title } });
        if (existing) continue;
        await kbRepo.save(
          kbRepo.create({
            title,
            category,
            template: category,
            sourcePath: `riseup-drive/${category}/${section}/${title}`,
            meta: { section, fileType: extOf(title), source: 'Riseup Drive' },
          }),
        );
        kbCreated++;
      }
    }
  }
  console.log(`KB catalog: ${kbCreated} document(s) created.`);

  // --- Rate card (seniority-tiered day rates) ---
  const rateRepo = dataSource.getRepository(RateCard);
  let rcCreated = 0;
  for (const entry of RATE_CARD) {
    for (const seniority of Object.values(Seniority)) {
      const existing = await rateRepo.findOne({ where: { role: entry.role, seniority } });
      if (existing) continue;
      await rateRepo.save(
        rateRepo.create({
          department: entry.department,
          role: entry.role,
          seniority,
          dayRateCents: String(entry.rates[seniority]),
          currency: 'USD',
        }),
      );
      rcCreated++;
    }
  }
  console.log(`Rate card: ${rcCreated} entr(ies) created.`);

  await dataSource.destroy();
  console.log('Seed complete.');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
