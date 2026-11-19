'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthGuard } from '@/app/components/AuthGuard';
import apiClient from '@/app/lib/api/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { User as UserIcon, MessageSquare, WifiOff, RefreshCw, AlertCircle, Lock, Wifi, WifiOff as WifiOffIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useGlobalToast } from '@/app/components/common/Toast';
import { useMessageE2E } from '@/app/lib/hooks/useMessageE2E';
import { useMessagesWebSocket, useMessageReconciliation } from '@/app/lib/hooks/useMessagesWebSocket';
import { useConversationDrafts } from '@/app/lib/hooks/useConversationDrafts';
import { ENCRYPTED_PREVIEW } from '@/app/lib/crypto/messageE2E';
import { ConfirmDialog } from '@/app/components/admin/ConfirmDialog';
import { MessageComposer } from '@/app/components/messages/MessageComposer';
import { ThreadListEmptyState, ThreadMessagesEmptyState } from '@/app/components/messages/MessagesEmptyState';

function extractPageData<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as T[];
  if (Array.isArray(record.messages)) return record.messages as T[];
  if (Array.isArray(payload)) return payload as T[];
  return [];
}

const DEV_BYPASS_AUTH_ENABLED =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

function isExpectedDevOfflineError(error: unknown): boolean {
  return (
    DEV_BYPASS_AUTH_ENABLED &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_NETWORK'
  );
}

interface Thread {
  confessionId: string;
  senderId: string;
  authorAnonymousUserId?: string | null;
  confessionMessage: string;
  lastMessage: string;
  lastMessageEncrypted?: boolean;
  lastMessageAt: string;
  hasUnread: boolean;
  isAuthor: boolean;
}

interface Message {
  id: number;
  content: string;
  isEncrypted?: boolean;
  createdAt: string;
  hasReply: boolean;
  replyContent: string | null;
  repliedAt: string | null;
}

interface DecryptedMessage extends Message {
  decryptedContent: string;
  decryptedReply: string | null;
}

/**
 * Stable identifier for a conversation. A thread is uniquely described by
 * the confession it belongs to plus the anonymous sender of the message.
 */
function threadKey(thread: Pick<Thread, 'confessionId' | 'senderId'>): string {
  return `${thread.confessionId}_${thread.senderId}`;
}

function MobileThreadList({
  threads,
  selectedThread,
  isLoading,
  error,
  onSelect,
  onRetry,
  onBack,
  isConnected,
  isReconnecting,
  reconnectAttempts,
  pendingReconciliation,
  onReconnect,
}: {
  threads: Thread[];
  selectedThread: Thread | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (t: Thread) => void;
  onRetry: () => void;
  onBack: () => void;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  pendingReconciliation: boolean;
  onReconnect: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-[var(--surface)]">
      <div className="p-4 border-b border-[var(--border)] flex items-center gap-2">
        {selectedThread && (
          <Button variant="ghost" size="sm" onClick={onBack} className="mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Button>
        )}
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Messages
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {isReconnecting && (
            <span className="text-xs text-[var(--warning)] flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Reconnecting... ({reconnectAttempts})
            </span>
          )}
          {pendingReconciliation && (
            <span className="text-xs text-[var(--primary-deep)] flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Syncing...
            </span>
          )}
          {!isReconnecting && !pendingReconciliation && (
            <span className={`flex items-center gap-1 text-xs ${isConnected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  Connected
                </>
              ) : (
                <>
                  <WifiOffIcon className="w-3 h-3" />
                  Disconnected
                </>
              )}
            </span>
          )}
          {!isConnected && !isReconnecting && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onReconnect}
              className="text-xs h-6 px-2"
            >
              Reconnect
            </Button>
          )}
        </div>
      </div>
      {!selectedThread && (
        <ScrollArea className="flex-1">
          {error ? (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-[var(--warning)]/10 p-4 rounded-full">
                <WifiOff className="w-8 h-8 text-[var(--warning)]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">Backend Unreachable</p>
                <p className="text-xs text-[var(--text-muted)] max-w-[200px]">{error}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={onRetry} className="mt-2 gap-2">
                <RefreshCw className="w-3 h-3" />
                Retry Fetch
              </Button>
            </div>
          ) : isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
              <ThreadListEmptyState />
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {threads.map((thread) => (
                <button
                  key={`${thread.confessionId}-${thread.senderId}`}
                  onClick={() => onSelect(thread)}
                  className="w-full p-4 text-left hover:bg-[var(--surface-muted)] transition-colors flex flex-col gap-1"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-[var(--primary-deep)] uppercase tracking-wider">
                      {thread.isAuthor ? 'Your Confession' : 'Sent Message'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[var(--foreground)] line-clamp-1">
                    {thread.confessionMessage}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                    {thread.lastMessageEncrypted ? ENCRYPTED_PREVIEW : thread.lastMessage}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const {
    isReady: e2eReady,
    keyError,
    needsKeyRecovery,
    session: e2eSession,
    encryptForThread,
    decryptForThread,
    createKeyBackup,
    restoreFromBackup,
    startFreshKeys,
  } = useMessageE2E();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [showStartFreshConfirm, setShowStartFreshConfirm] = useState(false);
  const [isStartingFresh, setIsStartingFresh] = useState(false);
  const toast = useGlobalToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Unsent message text is kept per conversation for the lifetime of the
  // browser tab session, so switching conversations (or coming back from the
  // thread list on mobile) never throws away what the user typed.
  const { drafts, setDraft, clearDraft, hasDraft } = useConversationDrafts();

  // The composer is shared by every conversation, so the text it shows is
  // derived from the draft that belongs to the currently selected thread.
  const activeThreadKey = selectedThread ? threadKey(selectedThread) : null;
  const newMessage = activeThreadKey ? drafts[activeThreadKey] ?? '' : '';

  const fetchThreads = useCallback(async () => {
    try {
      setIsLoadingThreads(true);
      setThreadsError(null);
      const response = await apiClient.get('/messages/threads');
      setThreads(extractPageData<Thread>(response.data));
    } catch (error) {
      if (isExpectedDevOfflineError(error)) {
        console.debug('Skipping expected local messages error while backend is offline.');
        setThreadsError('Messages will appear once the local backend is running.');
      } else {
        console.error('Failed to fetch threads:', error);
        setThreadsError('Unable to load conversations. Check your connection and try again.');
      }
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  const decryptMessages = useCallback(
    async (rawMessages: Message[], thread: Thread): Promise<DecryptedMessage[]> => {
      if (!thread.authorAnonymousUserId) {
        return rawMessages.map((m) => ({
          ...m,
          decryptedContent: m.content,
          decryptedReply: m.replyContent,
        }));
      }

      const threadCtx = {
        confessionId: thread.confessionId,
        senderAnonId: thread.senderId,
        authorAnonymousUserId: thread.authorAnonymousUserId,
        isAuthor: thread.isAuthor,
      };

      return Promise.all(
        rawMessages.map(async (m) => ({
          ...m,
          decryptedContent: await decryptForThread(m.content, threadCtx),
          decryptedReply: m.replyContent
            ? await decryptForThread(m.replyContent, threadCtx)
            : null,
        })),
      );
    },
    [decryptForThread],
  );

  const fetchMessages = useCallback(
    async (thread: Thread) => {
      try {
        setIsLoadingMessages(true);
        setMessagesError(null);
        const response = await apiClient.get(
          `/messages?confession_id=${thread.confessionId}&sender_id=${thread.senderId}`,
        );
        const raw = extractPageData<Message>(response.data);
        const decrypted = e2eReady
          ? await decryptMessages(raw, thread)
          : raw.map((m) => ({
              ...m,
              decryptedContent: ENCRYPTED_PREVIEW,
              decryptedReply: m.replyContent ? ENCRYPTED_PREVIEW : null,
            }));
        setMessages(decrypted);
      } catch (error) {
        if (isExpectedDevOfflineError(error)) {
          console.debug('Skipping expected local thread error while backend is offline.');
          setMessagesError('Messages will appear once the local backend is running.');
        } else {
          console.error('Failed to fetch messages:', error);
          setMessagesError('Unable to load messages for this conversation.');
        }
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [decryptMessages, e2eReady],
  );

  // WebSocket for real-time message updates with reconnection and reconciliation
  const {
    isConnected,
    isReconnecting,
    reconnectAttempts,
    forceReconnect,
  } = useMessagesWebSocket({
    onNewMessage: (threadId) => {
      // Update thread list with new message
      setThreads(prev => prev.map(t =>
        `${t.confessionId}_${t.senderId}` === threadId
          ? { ...t, lastMessageAt: new Date().toISOString(), hasUnread: !t.isAuthor }
          : t
      ));
      // If this thread is currently selected, fetch messages
      if (selectedThread && `${selectedThread.confessionId}_${selectedThread.senderId}` === threadId) {
        fetchMessages(selectedThread);
      }
    },
    onNewReply: (threadId) => {
      setThreads(prev => prev.map(t =>
        `${t.confessionId}_${t.senderId}` === threadId
          ? { ...t, lastMessageAt: new Date().toISOString(), hasUnread: t.isAuthor }
          : t
      ));
      if (selectedThread && `${selectedThread.confessionId}_${selectedThread.senderId}` === threadId) {
        fetchMessages(selectedThread);
      }
    },
    onMessageRead: (threadId, messageIds) => {
      // Update read state in messages if thread is selected
      if (selectedThread && `${selectedThread.confessionId}_${selectedThread.senderId}` === threadId) {
        setMessages(prev => prev.map(m =>
          messageIds.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m
        ));
      }
    },
    onThreadUpdated: () => {
      // Refresh thread list
      fetchThreads();
    },
    enabled: e2eReady,
  });

  // Reconciliation hook for missed messages after reconnect
  const { pendingReconciliation, onReconnect } = useMessageReconciliation(
    selectedThread ? `${selectedThread.confessionId}_${selectedThread.senderId}` : null,
    () => selectedThread ? fetchMessages(selectedThread) : Promise.resolve(),
    { enabled: e2eReady && isConnected }
  );

  // Trigger reconciliation on reconnect
  useEffect(() => {
    if (isConnected && !isReconnecting) {
      onReconnect();
    }
  }, [isConnected, isReconnecting, onReconnect]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedThread && e2eReady) {
      fetchMessages(selectedThread);
      setShowMobileList(false);
    }
  }, [selectedThread, e2eReady, fetchMessages]);

  const handleSendMessage = async () => {
    if (!selectedThread || !newMessage.trim() || !e2eReady) return;
    // Synchronous re-entry guard: state updates are batched by React and may
    // lag behind a rapid second Enter-key press before the UI re-renders.
    if (isSendingRef.current) return;
    if (!selectedThread.authorAnonymousUserId) {
      toast.error('Cannot encrypt: missing author identity for this thread.');
      return;
    }

    const text = newMessage;
    try {
      isSendingRef.current = true;
      setIsSending(true);
      const threadCtx = {
        confessionId: selectedThread.confessionId,
        senderAnonId: selectedThread.senderId,
        authorAnonymousUserId: selectedThread.authorAnonymousUserId,
        isAuthor: selectedThread.isAuthor,
      };
      const ciphertext = await encryptForThread(text.trim(), threadCtx);

      if (selectedThread.isAuthor) {
        const unrepliedMessage = [...messages].reverse().find((m) => !m.hasReply);
        if (unrepliedMessage) {
          await apiClient.post('/messages/reply', {
            message_id: unrepliedMessage.id,
            reply: ciphertext,
          });
        } else {
          toast.warning('Please wait for the sender to message you again.');
          return;
        }
      } else {
        await apiClient.post('/messages', {
          confession_id: selectedThread.confessionId,
          content: ciphertext,
        });
      }

      // The message went through, so the draft for this conversation is no
      // longer needed. Any other conversation keeps its own draft.
      if (activeThreadKey) clearDraft(activeThreadKey);
      fetchMessages(selectedThread);
      fetchThreads();
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send encrypted message. Ensure both participants have E2E keys.');
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleCreateBackup = async () => {
    if (recoveryPassphrase.length < 8) {
      toast.warning('Use a recovery passphrase of at least 8 characters.');
      return;
    }
    try {
      await createKeyBackup(recoveryPassphrase);
      toast.success('Recovery backup saved. Store your passphrase safely.');
      setRecoveryPassphrase('');
      setShowRecovery(false);
    } catch (error) {
      console.error('Backup failed:', error);
      toast.error('Failed to create key backup.');
    }
  };

  const handleRestoreBackup = async () => {
    if (recoveryPassphrase.length < 8) return;
    try {
      await restoreFromBackup(recoveryPassphrase);
      setRecoveryPassphrase('');
      setShowRecovery(false);
      if (selectedThread) fetchMessages(selectedThread);
    } catch {
      toast.error('Recovery failed. Check your passphrase and try again.');
    }
  };

  const handleStartFresh = async () => {
    try {
      setIsStartingFresh(true);
      await startFreshKeys();
      setShowStartFreshConfirm(false);
      toast.success('New encryption keys created for this device.');
    } catch (error) {
      console.error('Failed to start fresh with new keys:', error);
      toast.error('Failed to create new encryption keys.');
    } finally {
      setIsStartingFresh(false);
    }
  };

  const handleSelectThread = (thread: Thread) => {
    // The composer text is derived from the draft of the selected thread, so
    // switching conversations restores whatever was typed in that thread.
    setSelectedThread(thread);
    setMessagesError(null);
  };

  const handleBackToList = () => {
    // The draft of the conversation we are leaving is kept, so coming back
    // to it (or to another conversation) never loses unsent text.
    setSelectedThread(null);
    setShowMobileList(true);
    setMessagesError(null);
  };

  const handleDraftChange = (value: string) => {
    if (!activeThreadKey) return;
    setDraft(activeThreadKey, value);
  };

  const handleDiscardDraft = () => {
    if (!activeThreadKey) return;
    clearDraft(activeThreadKey);
  };

  return (
    <AuthGuard>
      {needsKeyRecovery && (
        <div
          role="alert"
          className="bg-[var(--warning)]/10 border-b border-[var(--warning)]/30 px-4 py-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 text-[var(--warning)] flex-shrink-0" />
            <p className="text-sm text-[var(--foreground)]">
              We found encryption keys registered for your account on another
              device. Enter your recovery passphrase to restore access to your
              previous messages, or start fresh — starting fresh will make
              previous messages permanently unreadable.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="password"
              placeholder="Recovery passphrase (min 8 chars)"
              value={recoveryPassphrase}
              onChange={(e) => setRecoveryPassphrase(e.target.value)}
              className="sm:max-w-xs"
            />
            <Button size="sm" onClick={handleRestoreBackup} disabled={recoveryPassphrase.length < 8}>
              Restore keys
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowStartFreshConfirm(true)}
            >
              Start fresh instead
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showStartFreshConfirm}
        onOpenChange={setShowStartFreshConfirm}
        title="Start fresh with new encryption keys?"
        description="This will generate new encryption keys for this device. Previous messages encrypted under your old keys will become permanently unreadable — this cannot be undone."
        confirmLabel="Start fresh"
        variant="danger"
        loading={isStartingFresh}
        onConfirm={handleStartFresh}
      />

      {keyError && (
        <div className="bg-[var(--warning)]/10 border-b border-[var(--warning)]/30 px-4 py-2 text-sm text-[var(--foreground)] flex items-center justify-between gap-2">
          <span>{keyError}</span>
          <Button variant="link" className="h-auto p-0 text-[var(--foreground)]" onClick={() => setShowRecovery(true)}>
            Restore from backup
          </Button>
        </div>
      )}

      {e2eReady && e2eSession && !e2eSession.hasBackup && !keyError && (
        <div className="bg-[var(--accent-soft)] border-b border-[var(--accent-border)] px-4 py-2 text-sm text-[var(--primary-deep)] flex items-center justify-between gap-2">
          <span>No recovery backup set up. If you lose this device, your encrypted messages cannot be recovered.</span>
          <Button variant="link" className="h-auto p-0 text-[var(--primary-deep)]" onClick={() => setShowRecovery(true)}>
            Set up backup
          </Button>
        </div>
      )}

      {showRecovery && (
        <div className="border-b border-[var(--border)] p-4 bg-[var(--surface)] space-y-2">
          <p className="text-sm text-[var(--secondary)]">
            Set or enter a recovery passphrase to backup or restore encryption keys on this device.
          </p>
          <Input
            type="password"
            placeholder="Recovery passphrase (min 8 chars)"
            value={recoveryPassphrase}
            onChange={(e) => setRecoveryPassphrase(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateBackup}>Save backup</Button>
            <Button size="sm" variant="outline" onClick={handleRestoreBackup}>Restore keys</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRecovery(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Mobile: toggle between list and detail */}
      <div className="flex h-[calc(100vh-4rem)] bg-[var(--surface-muted)] overflow-hidden">
        <div className="md:hidden w-full">
          {showMobileList || !selectedThread ? (
            <MobileThreadList
              threads={threads}
              selectedThread={selectedThread}
              isLoading={isLoadingThreads}
              error={threadsError}
              onSelect={handleSelectThread}
              onRetry={fetchThreads}
              onBack={handleBackToList}
              isConnected={isConnected}
              isReconnecting={isReconnecting}
              reconnectAttempts={reconnectAttempts}
              pendingReconciliation={pendingReconciliation}
              onReconnect={forceReconnect}
            />
          ) : (
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleBackToList}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Button>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="bg-[var(--accent-soft)] p-1.5 rounded-full text-[var(--primary-deep)] flex-shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{selectedThread.confessionMessage}</p>
                    <Badge variant="outline" className="text-[9px] py-0 h-3.5">{selectedThread.isAuthor ? 'AUTHOR' : 'SENDER'}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {isReconnecting && (
                      <span className="text-xs text-[var(--warning)] flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Reconnecting... ({reconnectAttempts})
                      </span>
                    )}
                    {pendingReconciliation && (
                      <span className="text-xs text-[var(--primary-deep)] flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Syncing...
                      </span>
                    )}
                    {!isReconnecting && !pendingReconciliation && (
                      <span className={`flex items-center gap-1 text-xs ${isConnected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
                        {isConnected ? (
                          <>
                            <Wifi className="w-3 h-3" />
                            Connected
                          </>
                        ) : (
                          <>
                            <WifiOffIcon className="w-3 h-3" />
                            Disconnected
                          </>
                        )}
                      </span>
                    )}
                    {!isConnected && !isReconnecting && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={forceReconnect}
                        className="text-xs h-6 px-2"
                      >
                        Reconnect
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1 p-3 bg-[var(--surface-muted)]">
                {isLoadingMessages || !e2eReady ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-2/3 rounded-lg" />
                    <Skeleton className="h-8 w-1/2 ml-auto rounded-lg" />
                    <Skeleton className="h-8 w-3/4 rounded-lg" />
                  </div>
                ) : messagesError ? (
                  <div className="p-6 flex flex-col items-center justify-center text-center space-y-3 h-full">
                    <AlertCircle className="w-8 h-8 text-[var(--warning)]" />
                    <p className="text-sm text-[var(--text-muted)]">{messagesError}</p>
                    <Button size="sm" variant="outline" onClick={() => selectedThread && fetchMessages(selectedThread)} className="gap-2">
                      <RefreshCw className="w-3 h-3" />
                      Try Again
                    </Button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16">
                    <ThreadMessagesEmptyState />
                  </div>
                ) : (
                  <div className="space-y-4 pb-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className="space-y-1.5">
                        <div className={`flex ${selectedThread.isAuthor ? 'justify-start' : 'justify-end'}`}>
                          <Card className={`max-w-[85%] p-2.5 ${
                            selectedThread.isAuthor
                              ? 'bg-[var(--surface)] border-[var(--border)]'
                              : 'bg-[var(--primary)] text-white border-none'
                          }`}>
                            <p className="text-sm">{msg.decryptedContent}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <p className={`text-[10px] ${selectedThread.isAuthor ? 'text-[var(--text-muted)]' : 'text-[var(--primary-deep)]'}`}>
                                {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                              </p>
                              {!selectedThread.isAuthor && msg.hasReply && (
                                <Badge variant="secondary" className="bg-[var(--accent-soft)] text-[8px] py-0 h-3 text-[var(--foreground)] border-none">Replied</Badge>
                              )}
                            </div>
                          </Card>
                        </div>
                        {msg.hasReply && msg.decryptedReply && (
                          <div className={`flex ${selectedThread.isAuthor ? 'justify-end' : 'justify-start'}`}>
                            <Card className={`max-w-[85%] p-2.5 ${
                              selectedThread.isAuthor
                                ? 'bg-[var(--primary)] text-white border-none'
                                : 'bg-[var(--surface)] border-[var(--border)]'
                            }`}>
                              <p className="text-sm">{msg.decryptedReply}</p>
                              <p className={`text-[10px] mt-1 ${selectedThread.isAuthor ? 'text-[var(--primary-deep)]' : 'text-[var(--text-muted)]'}`}>
                                {msg.repliedAt && formatDistanceToNow(new Date(msg.repliedAt), { addSuffix: true })}
                              </p>
                            </Card>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
              <div className="p-2 sm:p-3 bg-[var(--surface)] border-t border-[var(--border)]">
                <MessageComposer
                  inputRef={inputRef}
                  value={newMessage}
                  onChange={handleDraftChange}
                  onSend={handleSendMessage}
                  onDiscard={handleDiscardDraft}
                  hasDraft={hasDraft(activeThreadKey ?? '')}
                  disabled={!e2eReady}
                  isSending={isSending}
                  placeholder={selectedThread.isAuthor ? 'Type an encrypted reply...' : 'Send encrypted message...'}
                  label={selectedThread.isAuthor ? 'Type an encrypted reply' : 'Send encrypted message'}
                />
                {selectedThread.isAuthor && messages.every(m => m.hasReply) && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">You have replied to all messages. Wait for the sender to message you again.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: split view */}
        <div className="hidden md:flex w-full">
          <div className="w-1/3 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col">
            <div className="p-4 border-b border-[var(--border)]">
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Messages
              </h1>
            </div>
            <ScrollArea className="flex-1">
              {threadsError ? (
                <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-[var(--warning)]/10 p-4 rounded-full">
                    <WifiOff className="w-8 h-8 text-[var(--warning)]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Backend Unreachable</p>
                    <p className="text-xs text-[var(--text-muted)] max-w-[200px]">{threadsError}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={fetchThreads} className="mt-2 gap-2">
                    <RefreshCw className="w-3 h-3" />
                    Retry Fetch
                  </Button>
                </div>
              ) : isLoadingThreads ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="p-8 flex flex-col items-center justify-center text-center">
                  <ThreadListEmptyState />
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {threads.map((thread) => (
                    <button
                      key={`${thread.confessionId}-${thread.senderId}`}
                      onClick={() => handleSelectThread(thread)}
                      className={`w-full p-4 text-left hover:bg-[var(--surface-muted)] transition-colors flex flex-col gap-1 ${
                        selectedThread?.confessionId === thread.confessionId && selectedThread?.senderId === thread.senderId ? 'bg-[var(--accent-soft)]' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-semibold text-[var(--primary-deep)] uppercase tracking-wider">
                          {thread.isAuthor ? 'Your Confession' : 'Sent Message'}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--foreground)] line-clamp-1">{thread.confessionMessage}</p>
                      <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                        {thread.lastMessageEncrypted ? ENCRYPTED_PREVIEW : thread.lastMessage}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex-1 flex flex-col">
            {selectedThread ? (
              <>
                <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
                  <div className="flex items-center gap-3">
                    <div className="bg-[var(--accent-soft)] p-2 rounded-full text-[var(--primary-deep)]">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold text-[var(--foreground)] line-clamp-1">{selectedThread.confessionMessage}</h2>
                      <Badge variant="outline" className="text-[10px] py-0 h-4">{selectedThread.isAuthor ? 'AUTHOR VIEW' : 'SENDER VIEW'}</Badge>
                    </div>
                    {/* Connection status indicator */}
                    <div className="flex items-center gap-2">
                      {isReconnecting && (
                        <span className="text-xs text-[var(--warning)] flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Reconnecting... ({reconnectAttempts})
                        </span>
                      )}
                      {pendingReconciliation && (
                        <span className="text-xs text-[var(--primary-deep)] flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Syncing messages...
                        </span>
                      )}
                      {!isReconnecting && !pendingReconciliation && (
                        <span className={`flex items-center gap-1 text-xs ${isConnected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
                          {isConnected ? (
                            <>
                              <Wifi className="w-3 h-3" />
                              Connected
                            </>
                          ) : (
                            <>
                              <WifiOffIcon className="w-3 h-3" />
                              Disconnected
                            </>
                          )}
                        </span>
                      )}
                      {!isConnected && !isReconnecting && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={forceReconnect}
                          className="text-xs h-6 px-2"
                        >
                          Reconnect
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4 bg-[var(--surface-muted)]">
                  {isLoadingMessages || !e2eReady ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-2/3 rounded-lg" />
                      <Skeleton className="h-10 w-1/2 ml-auto rounded-lg" />
                      <Skeleton className="h-10 w-3/4 rounded-lg" />
                    </div>
                  ) : messagesError ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 h-full">
                      <AlertCircle className="w-8 h-8 text-[var(--warning)]" />
                      <p className="text-sm text-[var(--text-muted)]">{messagesError}</p>
                      <Button size="sm" variant="outline" onClick={() => selectedThread && fetchMessages(selectedThread)} className="gap-2">
                        <RefreshCw className="w-3 h-3" />
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6 pb-4">
                      {messages.map((msg) => (
                        <div key={msg.id} className="space-y-2">
                          <div className={`flex ${selectedThread.isAuthor ? 'justify-start' : 'justify-end'}`}>
                            <Card className={`max-w-[80%] p-3 ${
                              selectedThread.isAuthor
                                ? 'bg-[var(--surface)] border-[var(--border)]'
                                : 'bg-[var(--primary)] text-white border-none'
                            }`}>
                              <p className="text-sm">{msg.decryptedContent}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <p className={`text-[10px] ${selectedThread.isAuthor ? 'text-[var(--text-muted)]' : 'text-[var(--primary-deep)]'}`}>
                                  {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                </p>
                                {!selectedThread.isAuthor && msg.hasReply && (
                                  <Badge variant="secondary" className="bg-[var(--accent-soft)] text-[8px] py-0 h-3 text-[var(--foreground)] border-none">Replied</Badge>
                                )}
                              </div>
                            </Card>
                          </div>
                          {msg.hasReply && msg.decryptedReply && (
                            <div className={`flex ${selectedThread.isAuthor ? 'justify-end' : 'justify-start'}`}>
                              <Card className={`max-w-[80%] p-3 ${
                                selectedThread.isAuthor
                                  ? 'bg-[var(--primary)] text-white border-none'
                                  : 'bg-[var(--surface)] border-[var(--border)]'
                              }`}>
                                <p className="text-sm">{msg.decryptedReply}</p>
                                <p className={`text-[10px] mt-1 ${selectedThread.isAuthor ? 'text-[var(--primary-deep)]' : 'text-[var(--text-muted)]'}`}>
                                  {msg.repliedAt && formatDistanceToNow(new Date(msg.repliedAt), { addSuffix: true })}
                                </p>
                              </Card>
                            </div>
                          )}
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center text-center py-16">
                          <ThreadMessagesEmptyState />
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                <div className="p-3 sm:p-4 bg-[var(--surface)] border-t border-[var(--border)]">
                  <MessageComposer
                    value={newMessage}
                    onChange={handleDraftChange}
                    onSend={handleSendMessage}
                    onDiscard={handleDiscardDraft}
                    hasDraft={hasDraft(activeThreadKey ?? '')}
                    disabled={!e2eReady}
                    isSending={isSending}
                    placeholder={selectedThread.isAuthor ? 'Type an encrypted reply...' : 'Send encrypted message...'}
                    label={selectedThread.isAuthor ? 'Type an encrypted reply' : 'Send encrypted message'}
                  />
                  {selectedThread.isAuthor && messages.every(m => m.hasReply) && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">You have replied to all messages. Wait for the sender to message you again.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] p-8">
                <div className="bg-[var(--surface-muted)] p-6 rounded-full mb-4">
                  <MessageSquare className="w-12 h-12" />
                </div>
                <h3 className="text-lg font-medium text-[var(--foreground)] mb-1">Select a conversation</h3>
                <p className="text-sm max-w-xs text-center">
                  Choose a message thread from the list to view the conversation.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
