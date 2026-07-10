// Stack-recommendation table — transcribed verbatim from the Generation-Engine spec §1.
// This is the ONLY place a default stack may be asserted. The portfolio pages do not publish a
// tech stack, so a project's stack is resolved by matching its shape (Category / Product Type /
// Platform Type / Service Type) against these rules.

export interface StackRule {
  /** Human label for the project shape (spec §1, column 1). */
  shape: string;
  /** Lowercase substrings matched against the project's category/product/platform/service text. */
  match: string[];
  /** Recommended default stack (spec §1, column 2). */
  stack: string[];
}

export const STACK_RULES: StackRule[] = [
  { shape: 'AI Product (health/fitness/wellness mobile)', match: ['ai product', 'health', 'fitness', 'wellness'], stack: ['Flutter', 'Node.js/Express', 'PostgreSQL', 'Redis', 'OpenAI/Gemini', 'Firebase'] },
  { shape: 'AI Product (B2B web)', match: ['ai product', 'b2b'], stack: ['Next.js', 'Node.js/Express', 'PostgreSQL', 'OpenAI/Gemini'] },
  { shape: 'AI Automation (workflow/HR/content)', match: ['ai automation', 'workflow', 'hr'], stack: ['n8n', 'OpenAI/Gemini', 'Google API', 'React', 'Looker Studio'] },
  { shape: 'WordPress AI plugin', match: ['wordpress plugin', 'plugin'], stack: ['PHP', 'WordPress', 'Tailwind CSS', 'OpenAI/Gemini'] },
  { shape: 'Content pipeline', match: ['content pipeline', 'content'], stack: ['n8n', 'Langchain', 'OpenAI/Gemini', 'WordPress'] },
  { shape: 'Corporate website (dynamic backend)', match: ['corporate website', 'website'], stack: ['Next.js', 'Laravel', 'MySQL'] },
  { shape: 'Corporate website (marketplace/eCom)', match: ['marketplace'], stack: ['WordPress', 'WooCommerce', 'MySQL'] },
  { shape: 'Web system (enterprise/pharma/CRM)', match: ['web system', 'enterprise', 'pharma', 'crm'], stack: ['Laravel', 'Vue.js', 'MySQL'] },
  { shape: 'Web system (scientific/legacy migration)', match: ['legacy', 'migration', 'scientific'], stack: ['React', 'TypeScript', 'Vite', 'Tailwind', 'shadcn/ui', 'Docker', 'Nginx'] },
  { shape: 'Web system (cloud migration)', match: ['cloud migration', 'cloud'], stack: ['Docker', 'Azure/AWS', 'PostgreSQL', 'Python'] },
  { shape: 'Mobile app (lifestyle/utility)', match: ['lifestyle', 'utility'], stack: ['Flutter', 'Firebase', 'Dart'] },
  { shape: 'Mobile app (native)', match: ['native'], stack: ['Kotlin/Swift', 'Android/iOS'] },
  { shape: 'Mobile app (cross-platform + backend)', match: ['mobile app', 'mobile apps', 'website and mobile'], stack: ['React Native', 'Node.js', 'MongoDB'] },
  { shape: 'eCommerce', match: ['ecommerce', 'e-commerce'], stack: ['WordPress', 'WooCommerce'] },
  { shape: 'eLearning (LMS)', match: ['elearning', 'e-learning', 'lms', 'learning management', 'online training', 'online course'], stack: ['Laravel', 'Vue.js', 'MySQL', 'Moodle Cloud'] },
  { shape: 'eLearning (content-driven, low-bandwidth)', match: ['low-bandwidth', 'training video'], stack: ['Laravel', 'PHP', 'MySQL', 'Bootstrap', 'Firebase', 'RapidPro'] },
  { shape: 'eGov / UN-NGO web platforms', match: ['egov', 'e-gov', 'unicef', 'ngo', 'un-ngo', 'government'], stack: ['Laravel', 'MySQL', 'Bootstrap', 'Vue.js', 'RapidPro'] },
  { shape: 'Games (mobile/casino)', match: ['casino', 'card game'], stack: ['Unity', 'C#', 'Firebase', 'PostgreSQL/MongoDB', 'Spring Boot'] },
  { shape: 'Games (hyper-casual/arcade)', match: ['hyper-casual', 'arcade'], stack: ['Unity', 'C#'] },
  { shape: 'Games (2D animation-heavy)', match: ['2d animation'], stack: ['Cocos2d-x', 'Spine Animation', 'C++'] },
  { shape: 'Games (general)', match: ['game', 'games', 'gaming'], stack: ['Unity', 'C#', 'Firebase'] },
  { shape: 'AR/VR/MR (education/training)', match: ['ar/vr', 'vr', 'mixed reality', 'virtual reality'], stack: ['Unity', 'C#', 'Autodesk Maya', '3DS Max', 'Blender'] },
  { shape: 'AR mobile', match: ['augmented reality'], stack: ['Unity', 'Augmented Reality', 'Android/iOS'] },
  { shape: 'Graphic Design / Video / eLearning content', match: ['graphic design', 'video editing', 'video creation', 'motion graphics'], stack: ['Adobe Illustrator', 'Photoshop', 'After Effects', 'Premiere Pro'] },
  { shape: 'QA services', match: ['quality assurance', 'qa services'], stack: ['Selenium', 'Jira', 'JMeter', 'Appium', 'LoadRunner'] },
  { shape: 'DevOps / infra', match: ['devops', 'infrastructure', 'ci/cd', 'cloud deployment'], stack: ['AWS/Azure', 'Docker', 'Nginx', 'Jenkins', 'CI/CD'] },
];

/** The scraped fields that describe a project's shape. Category is the authoritative signal. */
export interface ShapeFields {
  category?: string;
  productType?: string;
  serviceType?: string;
  platformType?: string;
  title?: string;
}

// Field weights: a Category match ("eLearning") must beat a Platform match ("Website and Mobile"),
// which is near-useless for choosing a stack.
const FIELD_WEIGHT: { key: keyof ShapeFields; weight: number }[] = [
  { key: 'category', weight: 100 },
  { key: 'productType', weight: 60 },
  { key: 'serviceType', weight: 40 },
  { key: 'title', weight: 20 },
  { key: 'platformType', weight: 8 },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Word-boundary match — prevents 'ar' matching inside "Learning" or 'vr' inside "server". */
const hits = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${esc(term)}([^a-z0-9]|$)`, 'i').test(text);

/** Score = strongest (field weight x term length) across the rule's terms. */
function score(fields: ShapeFields, rule: StackRule): number {
  let best = 0;
  for (const { key, weight } of FIELD_WEIGHT) {
    const text = fields[key];
    if (!text) continue;
    for (const term of rule.match) if (hits(text, term)) best = Math.max(best, weight * term.length);
  }
  return best;
}

/** Stack rules matching a project's shape, most specific first. */
export function rulesForShape(fields: ShapeFields): StackRule[] {
  return STACK_RULES.map((r) => ({ r, s: score(fields, r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

/**
 * Derived default stack for a project shape. Returns the SINGLE most-specific matching rule's stack
 * (not a union) — unioning every loose match produced nonsense like Unity/AR on an eLearning project,
 * which would violate acceptance criterion §8.8.
 */
export function stackForShape(fields: ShapeFields): string[] {
  return rulesForShape(fields)[0]?.stack ?? [];
}
