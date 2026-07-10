import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadComment } from './lead-comment.entity';
import { LeadService } from './lead.service';
import { ApprovalDecision } from '../../common/enums';

@Injectable()
export class LeadCommentService {
  constructor(
    @InjectRepository(LeadComment) private readonly comments: Repository<LeadComment>,
    private readonly leads: LeadService,
  ) {}

  /** Thread for a lead, oldest first. Visibility mirrors the lead itself (403 if not allowed). */
  async list(leadId: string, viewer: { id: string; role: string }) {
    await this.leads.findVisible(leadId, viewer); // throws 403/404 — comments never leak a lead
    const rows = await this.comments.find({
      where: { leadId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });
    return rows.map((c) => ({
      id: c.id,
      body: c.body,
      decision: c.decision ?? null,
      createdAt: c.createdAt,
      author: c.author ? { id: c.author.id, name: c.author.name || c.author.email.split('@')[0], role: c.author.role } : null,
    }));
  }

  /** Post a plain comment. Both roles can; the thread is shared. */
  async add(leadId: string, authorId: string, body: string, viewer: { id: string; role: string }) {
    await this.leads.findVisible(leadId, viewer);
    const text = body.trim();
    if (!text) throw new BadRequestException('Comment cannot be empty');
    const saved = await this.comments.save(
      this.comments.create({ leadId, authorId, body: text.slice(0, 4000) }),
    );
    return this.one(saved.id);
  }

  /**
   * Record the note an admin attaches to an approve/reject so it lands in the same thread the rep
   * reads. Called by ApprovalService — never exposed directly.
   */
  async addDecision(leadId: string, authorId: string, decision: ApprovalDecision, note?: string) {
    const text = (note ?? '').trim();
    if (!text) return null; // approving without a note is allowed; nothing to post
    const saved = await this.comments.save(
      this.comments.create({ leadId, authorId, body: text.slice(0, 4000), decision }),
    );
    return this.one(saved.id);
  }

  private async one(id: string) {
    const c = await this.comments.findOne({ where: { id }, relations: ['author'] });
    if (!c) return null;
    return {
      id: c.id,
      body: c.body,
      decision: c.decision ?? null,
      createdAt: c.createdAt,
      author: c.author ? { id: c.author.id, name: c.author.name || c.author.email.split('@')[0], role: c.author.role } : null,
    };
  }
}
