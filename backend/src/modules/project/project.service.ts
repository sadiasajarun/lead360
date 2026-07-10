import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRepository } from './project.repository';
import { LeadService } from '../lead/lead.service';
import { CreateProjectDto, ProjectQueryDto } from './dtos/project.dtos';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly leads: LeadService,
  ) {}

  list(query: ProjectQueryDto) {
    return this.projects.search(query);
  }

  async findBySlug(slug: string) {
    const p = await this.projects.findBySlug(slug);
    if (!p) throw new NotFoundException(`Project ${slug} not found`);
    return p;
  }

  async create(dto: CreateProjectDto) {
    let slug = slugify(dto.name);
    if (await this.projects.findBySlug(slug)) slug = `${slug}-${Date.now().toString(36)}`;
    return this.projects.create({ ...dto, slug });
  }

  /** Edit a project (portfolio-synced, manual, or auto-created from a locked lead). */
  async update(id: string, dto: Partial<{ name: string; summary: string; category: string[]; techStack: string[]; link: string }>) {
    const existing = await this.projects.findById(id);
    if (!existing) throw new NotFoundException('Project not found');
    // Renaming regenerates the slug, but never collides with another project.
    const patch: Record<string, unknown> = { ...dto };
    if (dto.name && dto.name !== existing.name) {
      let slug = slugify(dto.name);
      const clash = await this.projects.findBySlug(slug);
      if (clash && clash.id !== id) slug = `${slug}-${Date.now().toString(36)}`;
      patch.slug = slug;
    }
    return this.projects.update(id, patch as never);
  }

  async remove(id: string) {
    const existing = await this.projects.findById(id);
    if (!existing) throw new NotFoundException('Project not found');
    await this.projects.softDelete(id);
    return { id, deleted: true };
  }

  // Fired by the 'lead.locked' event — idempotent (won't duplicate a project for the same lead).
  async createFromLead(leadId: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    let slug = slugify(lead.title);
    const existing = await this.projects.findBySlug(slug);
    if (existing && existing.sourceLeadId === leadId) return existing;
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    return this.projects.create({
      slug,
      name: lead.title,
      summary: `Auto-added from a locked lead (${lead.company}).`,
      sourceLeadId: leadId,
    });
  }
}
