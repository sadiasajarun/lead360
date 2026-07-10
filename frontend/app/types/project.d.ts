export interface Project {
  id: string;
  slug: string;
  name: string;
  summary?: string;
  category: string[];
  techStack: string[];
  sourceLeadId?: string;
  /** Live site or riseuplabs.com project page. */
  link?: string;
}

// A scraped riseuplabs.com portfolio project (the RAG evidence base the AI cites for tech stacks).
export interface PortfolioProject {
  id: string;
  title: string;
  summary?: string;
  detailUrl: string;
  categoryTags: string[];
  industryTags: string[];
  techStack: string[];
}

export interface ProjectsState {
  items: Project[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  portfolio: PortfolioProject[];
  portfolioStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
}
