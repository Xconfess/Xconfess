import { Inbox, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown in the conversation list when the user has no threads yet. */
export function ThreadListEmptyState() {
  return (
    <div role="status">
      <EmptyState
        icon={<Inbox className="h-10 w-10 text-[var(--text-muted)]" aria-hidden="true" />}
        title="No messages yet"
        description="When someone replies to your confession or you send a message, conversations will appear here."
      />
    </div>
  );
}

/** Shown inside an open conversation that has no messages yet. */
export function ThreadMessagesEmptyState() {
  return (
    <div role="status">
      <EmptyState
        icon={
          <MessageSquare className="h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
        }
        title="No messages in this thread yet"
        description="Send a message below to start the conversation."
      />
    </div>
  );
}
