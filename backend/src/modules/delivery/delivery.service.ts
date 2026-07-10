import { Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository';

@Injectable()
export class DeliveryService {
  constructor(private readonly deliveries: DeliveryRepository) {}

  async getForLead(leadId: string) {
    return (
      (await this.deliveries.findByLead(leadId)) ?? {
        leadId,
        method: 'download',
        status: 'not_delivered',
        files: [],
      }
    );
  }

  // Records that the branded PDF + Excel were downloaded (deliverables are download-only; email is disabled).
  async recordDownload(leadId: string) {
    const existing = await this.deliveries.findByLead(leadId);
    const data = {
      leadId,
      method: 'download',
      status: 'downloaded',
      deliveredAt: new Date(),
      files: [{ name: 'proposal.pdf', kind: 'pdf' }, { name: 'budget.xlsx', kind: 'xlsx' }],
    };
    return existing ? this.deliveries.update(existing.id, data) : this.deliveries.create(data);
  }
}
