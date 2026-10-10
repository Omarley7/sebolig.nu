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
