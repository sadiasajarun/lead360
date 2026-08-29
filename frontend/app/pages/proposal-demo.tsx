/**
 * Public demo page (Task 2 verification): renders the sample ProposalDocument
 * through the locked Design-2 block renderer. View at /proposal-demo.
 */
import { ProposalRenderer } from '~/components/proposal/ProposalRenderer';
import { sampleProposal } from '~/components/proposal/sample';

export default function ProposalDemo() {
  return (
    <div style={{ background: '#EDEBEA', minHeight: '100vh', padding: '24px 0' }}>
      <ProposalRenderer doc={sampleProposal} />
    </div>
  );
}
