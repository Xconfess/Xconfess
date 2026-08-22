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
import { Send, User as UserIcon, MessageSquare, WifiOff, RefreshCw, Inbox, AlertCircle, Lock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useGlobalToast } from '@/app/components/common/Toast';
import { useMessageE2E } from '@/app/lib/hooks/useMessageE2E';
import { ENCRYPTED_PREVIEW } from '@/app/lib/crypto/messageE2E';
import { ConfirmDialog } from '@/app/components/admin/ConfirmDialog';

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

function MobileThreadList({
  threads,
  selectedThread,
  isLoading,
  error,
  onSelect,
  onRetry,
  onBack,
}: {
  threads: Thread[];
  selectedThread: Thread | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (t: Thread) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
        {selectedThread && (
          <Button variant="ghost" size="sm" onClick={onBack} className="mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Button>
        )}
        <h1 className="text-lg font-bold flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Messages
        </h1>
      </div>
      {!selectedThread && (
        <ScrollArea className="flex-1">
          {error ? (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-full">
                <WifiOff className="w-8 h-8 text-amber-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Backend Unreachable</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">{error}</p>
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
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
                <Inbox className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">No messages yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                When someone replies to your confession or you send a message, conversations will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {threads.map((thread) => (
                <button
                  key={`${thread.confessionId}-${thread.senderId}`}
                  onClick={() => onSelect(thread)}
                  className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors flex flex-col gap-1"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                      {thread.isAuthor ? 'Your Confession' : 'Sent Message'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                    {thread.confessionMessage}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
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
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
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
  }, [decryptMessages, e2eReady]);

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
    if (!selectedThread.authorAnonymousUserId) {
      toast.error('Cannot encrypt: missing author identity for this thread.');
      return;
    }

    const text = newMessage;
    try {
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

      setNewMessage('');
      fetchMessages(selectedThread);
      fetchThreads();
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send encrypted message. Ensure both participants have E2E keys.');
    } finally {
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
    setSelectedThread(thread);
    setMessagesError(null);
  };

  const handleBackToList = () => {
    setSelectedThread(null);
    setShowMobileList(true);
    setMessagesError(null);
  };

  return (
    <AuthGuard>
      {needsKeyRecovery && (
        <div
          role="alert"
          className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
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
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span>{keyError}</span>
          <Button variant="link" className="h-auto p-0 text-amber-900" onClick={() => setShowRecovery(true)}>
            Restore from backup
          </Button>
        </div>
      )}

      {e2eReady && e2eSession && !e2eSession.hasBackup && !keyError && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2 text-sm text-blue-800 dark:text-blue-200 flex items-center justify-between gap-2">
          <span>No recovery backup set up. If you lose this device, your encrypted messages cannot be recovered.</span>
          <Button variant="link" className="h-auto p-0 text-blue-900 dark:text-blue-100" onClick={() => setShowRecovery(true)}>
            Set up backup
          </Button>
        </div>
      )}

      {showRecovery && (
        <div className="border-b border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-950 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
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
      <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 overflow-hidden">
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
            />
          ) : (
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleBackToList}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Button>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="bg-purple-100 dark:bg-purple-900/40 p-1.5 rounded-full text-purple-600 flex-shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{selectedThread.confessionMessage}</p>
                    <Badge variant="outline" className="text-[9px] py-0 h-3.5">{selectedThread.isAuthor ? 'AUTHOR' : 'SENDER'}</Badge>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1 p-3 bg-gray-50 dark:bg-gray-900">
                {isLoadingMessages || !e2eReady ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-2/3 rounded-lg" />
                    <Skeleton className="h-8 w-1/2 ml-auto rounded-lg" />
                    <Skeleton className="h-8 w-3/4 rounded-lg" />
                  </div>
                ) : messagesError ? (
                  <div className="p-6 flex flex-col items-center justify-center text-center space-y-3 h-full">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{messagesError}</p>
                    <Button size="sm" variant="outline" onClick={() => selectedThread && fetchMessages(selectedThread)} className="gap-2">
                      <RefreshCw className="w-3 h-3" />
                      Try Again
                    </Button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16">
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-full mb-3">
                      <MessageSquare className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No messages yet</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">Start the conversation by sending a message below.</p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className="space-y-1.5">
                        <div className={`flex ${selectedThread.isAuthor ? 'justify-start' : 'justify-end'}`}>
                          <Card className={`max-w-[85%] p-2.5 ${
                            selectedThread.isAuthor
                              ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                              : 'bg-purple-600 text-white border-none'
                          }`}>
                            <p className="text-sm">{msg.decryptedContent}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <p className={`text-[10px] ${selectedThread.isAuthor ? 'text-gray-400' : 'text-purple-200'}`}>
                                {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                              </p>
                              {!selectedThread.isAuthor && msg.hasReply && (
                                <Badge variant="secondary" className="bg-purple-500/50 text-[8px] py-0 h-3 text-white border-none">Replied</Badge>
                              )}
                            </div>
                          </Card>
                        </div>
                        {msg.hasReply && msg.decryptedReply && (
                          <div className={`flex ${selectedThread.isAuthor ? 'justify-end' : 'justify-start'}`}>
                            <Card className={`max-w-[85%] p-2.5 ${
                              selectedThread.isAuthor
                                ? 'bg-purple-600 text-white border-none'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            }`}>
                              <p className="text-sm">{msg.decryptedReply}</p>
                              <p className={`text-[10px] mt-1 ${selectedThread.isAuthor ? 'text-purple-200' : 'text-gray-400'}`}>
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
              <div className="p-3 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder={selectedThread.isAuthor ? 'Type an encrypted reply...' : 'Send encrypted message...'}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={isSending || !e2eReady}
                    className="flex-1 text-sm"
                  />
                  <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim() || !e2eReady} size="sm">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                {selectedThread.isAuthor && messages.every(m => m.hasReply) && (
                  <p className="text-[10px] text-gray-400 mt-2 text-center">You have replied to all messages. Wait for the sender to message you again.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: split view */}
        <div className="hidden md:flex w-full">
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Messages
              </h1>
            </div>
            <ScrollArea className="flex-1">
              {threadsError ? (
                <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-full">
                    <WifiOff className="w-8 h-8 text-amber-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Backend Unreachable</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">{threadsError}</p>
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
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
                    <Inbox className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">No messages yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[220px]">
                    When someone replies to your confession or you send a message, conversations will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {threads.map((thread) => (
                    <button
                      key={`${thread.confessionId}-${thread.senderId}`}
                      onClick={() => handleSelectThread(thread)}
                      className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors flex flex-col gap-1 ${
                        selectedThread?.confessionId === thread.confessionId && selectedThread?.senderId === thread.senderId ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                          {thread.isAuthor ? 'Your Confession' : 'Sent Message'}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{thread.confessionMessage}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
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
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 dark:bg-purple-900/40 p-2 rounded-full text-purple-600">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 line-clamp-1">{selectedThread.confessionMessage}</h2>
                      <Badge variant="outline" className="text-[10px] py-0 h-4">{selectedThread.isAuthor ? 'AUTHOR VIEW' : 'SENDER VIEW'}</Badge>
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900">
                  {isLoadingMessages || !e2eReady ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-2/3 rounded-lg" />
                      <Skeleton className="h-10 w-1/2 ml-auto rounded-lg" />
                      <Skeleton className="h-10 w-3/4 rounded-lg" />
                    </div>
                  ) : messagesError ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 h-full">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">{messagesError}</p>
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
                                ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                : 'bg-purple-600 text-white border-none'
                            }`}>
                              <p className="text-sm">{msg.decryptedContent}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <p className={`text-[10px] ${selectedThread.isAuthor ? 'text-gray-400' : 'text-purple-200'}`}>
                                  {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                </p>
                                {!selectedThread.isAuthor && msg.hasReply && (
                                  <Badge variant="secondary" className="bg-purple-500/50 text-[8px] py-0 h-3 text-white border-none">Replied</Badge>
                                )}
                              </div>
                            </Card>
                          </div>
                          {msg.hasReply && msg.decryptedReply && (
                            <div className={`flex ${selectedThread.isAuthor ? 'justify-end' : 'justify-start'}`}>
                              <Card className={`max-w-[80%] p-3 ${
                                selectedThread.isAuthor
                                  ? 'bg-purple-600 text-white border-none'
                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                              }`}>
                                <p className="text-sm">{msg.decryptedReply}</p>
                                <p className={`text-[10px] mt-1 ${selectedThread.isAuthor ? 'text-purple-200' : 'text-gray-400'}`}>
                                  {msg.repliedAt && formatDistanceToNow(new Date(msg.repliedAt), { addSuffix: true })}
                                </p>
                              </Card>
                            </div>
                          )}
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center text-center py-16">
                          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-3">
                            <MessageSquare className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No messages in this thread yet</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[220px]">Send a message to start the conversation.</p>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                <div className="p-4 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex gap-2">
                    <Input
                      placeholder={selectedThread.isAuthor ? 'Type an encrypted reply...' : 'Send encrypted message...'}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      disabled={isSending || !e2eReady}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim() || !e2eReady}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  {selectedThread.isAuthor && messages.every(m => m.hasReply) && (
                    <p className="text-[10px] text-gray-400 mt-2 text-center">You have replied to all messages. Wait for the sender to message you again.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-4">
                  <MessageSquare className="w-12 h-12" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Select a conversation</h3>
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
