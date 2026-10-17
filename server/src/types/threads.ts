// findbolig.nu's own shapes, as the findbolig client reads them. Plain types: nothing checks them at runtime.

export type ApiMessage = {
  sender?: { id: string; name: string };
  receiver?: { id: string; name: string };
  body: string;
  status?: string;
  attachments?: unknown[];
  id: string;
  created: string; // ISO date string
};

/** A thread with its messages (from /api/communications/messages/thread/...). */
export type ApiMessageThreadFull = {
  id: string;
  title: string;
  messages: ApiMessage[];
  relatedEntity: { id: string; type: string; ownerId: string } | null;
  archived: boolean;
  created: string; // ISO date string
};

/**
 * One row of the thread list (POST /api/communications/threads), with the thread's newest message.
 * findbolig.nu answers with more (unread and attachment flags, `relatedEntityState`, which it leaves
 * null); only the fields the thread walk reads are typed.
 */
export type ApiThreadSummary = {
  id: string;
  /** The offer id for an offer's thread; null for a thread about nothing in particular. */
  relatedEntity: string | null;
  relatedEntityType: string | null;
  lastMessage: ApiMessage | null;
};

export type ApiThreadsPage = {
  totalResults: number;
  page: number;
  pageSize: number;
  results: ApiThreadSummary[];
};
