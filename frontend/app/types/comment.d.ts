// A message in a lead's comment thread. The thread mixes plain comments with admin
// decision notes: `decision` is 'approved' | 'rejected' for the note that accompanied a
// decision, and null for an ordinary comment.
export type CommentDecision = 'approved' | 'rejected' | null;

export interface CommentAuthor {
  id: string;
  name: string;
  role: string;
}

export interface LeadComment {
  id: string;
  body: string;
  decision: CommentDecision;
  createdAt: string;
  author: CommentAuthor | null;
}
