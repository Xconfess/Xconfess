"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { CharacterCounter } from "./CharacterCounter";
import { FormattingToolbar } from "./FormattingToolbar";
import { PreviewPanel } from "./PreviewPanel";
import { DraftManager } from "./DraftManager";
import { StellarAnchorToggle } from "./StellarAnchorToggle";
import {
  validateConfessionForm,
  Gender,
  type ConfessionFormData,
  ValidationErrors,
} from "@/app/lib/utils/validation";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { useDrafts, Draft } from "@/app/lib/hooks/useDrafts";
import { Eye, EyeOff, Send, Loader2, CloudDownload } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import apiClient from "@/app/lib/api/client";
import { useGlobalToast } from "@/app/components/common/Toast";

interface EnhancedConfessionFormProps {
  onSubmit?: (data: ConfessionFormData & { stellarTxHash?: string }) => void;
  className?: string;
}

const TITLE_HINT_ID = "confession-title-hint";
const BODY_HINT_ID = "confession-body-hint";
const TITLE_ERROR_ID = "title-error";
const BODY_ERROR_ID = "body-error";

function getSafeSubmissionErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 400 || status === 422) {
      return "Please review the highlighted fields and try again.";
    }

    if (status === 429) {
      return "You are submitting too quickly. Please wait a moment and try again.";
    }

    if (status === 503) {
      return "Publishing is temporarily unavailable. Please try again later.";
    }

    if (status && status >= 500) {
      return "We could not publish your confession right now. Please try again later.";
    }

    if (!error.response) {
      return "We could not reach the server. Check your connection and try again.";
    }
  }

  return "We could not publish your confession right now. Please try again.";
}

function getAnchorFailureMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 429) {
      return "The Stellar network is busy right now. Please wait a moment and try again.";
    }

    if (status && status >= 500) {
      return "Unable to anchor this confession right now. Please try again later.";
    }

    if (!error.response) {
      return "Unable to reach Stellar right now. Check your connection and try again.";
    }
  }

  return "Unable to anchor this confession right now. Please try again.";
}

export const EnhancedConfessionForm: React.FC<EnhancedConfessionFormProps> = ({
  onSubmit,
  className,
}) => {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [gender, setGender] = useState<Gender | undefined>();
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [enableStellarAnchor, setEnableStellarAnchor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [stellarTxHash, setStellarTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [newerCloudDraft, setNewerCloudDraft] = useState<{
    title?: string;
    body?: string;
    content?: string;
    gender?: Gender;
    scheduledFor?: string;
    updatedAt?: string;
  } | null>(null);
  const [draftSubmittedAt, setDraftSubmittedAt] = useState(0);
  const submitSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { anchor } = useStellarWallet();
  const toast = useGlobalToast();
  const { drafts } = useDrafts();
  const currentValidationErrors = validateConfessionForm({
    title,
    body,
    gender,
    enableStellarAnchor,
  });
  const hasValidationErrors = Object.keys(currentValidationErrors).length > 0;

  const resetComposerState = useCallback(() => {
    setTitle("");
    setBody("");
    setGender(undefined);
    setEnableStellarAnchor(false);
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
    setStellarTxHash(null);
    setIsPreviewMode(false);
  }, []);

  useEffect(() => {
    return () => {
      if (submitSuccessTimerRef.current) {
        clearTimeout(submitSuccessTimerRef.current);
      }
    };
  }, []);

  const checkForNewerDrafts = useCallback(async () => {
    try {
      const response = await apiClient.get("/confessions/drafts");
      const cloudDrafts = response.data;

      if (cloudDrafts && cloudDrafts.length > 0) {
        const latestCloudDraft = cloudDrafts[0];
        const latestLocalDraft = drafts[0];

        if (
          !latestLocalDraft ||
          new Date(latestCloudDraft.updatedAt).getTime() > latestLocalDraft.savedAt
        ) {
          setNewerCloudDraft(latestCloudDraft);
        }
      }
    } catch (error) {
      console.debug("Could not sync drafts from backend:", error);
    }
  }, [drafts]);

  useEffect(() => {
    checkForNewerDrafts();

    const handleFocus = () => {
      checkForNewerDrafts();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checkForNewerDrafts]);

  const recoverCloudDraft = () => {
    if (newerCloudDraft) {
      setTitle(newerCloudDraft.title || "");
      setBody(newerCloudDraft.body || newerCloudDraft.content || "");
      if (newerCloudDraft.gender) setGender(newerCloudDraft.gender as Gender);

      if (newerCloudDraft.scheduledFor) {
        toast.info("Restored draft with scheduled publish metadata.");
      }

      setNewerCloudDraft(null);
    }
  };

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      if (
        Object.keys(currentValidationErrors).length <
        Object.keys(errors).length
      ) {
        setErrors(currentValidationErrors);
      }
    }
  }, [currentValidationErrors, errors]);

  const handleLoadDraft = (draft: Draft) => {
    setTitle(draft.title || "");
    setBody(draft.body);
    setGender(draft.gender);
    setNewerCloudDraft(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleTextChange = (newText: string, cursorPos: number) => {
    setBody(newText);
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (textareaRef.current) {
          const maxPos = textareaRef.current.value.length;
          const safeCursorPos = Math.min(cursorPos, maxPos);
          textareaRef.current.setSelectionRange(safeCursorPos, safeCursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (hasValidationErrors) {
      setErrors(currentValidationErrors);
      setSubmitError("Please review the highlighted fields and try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      let txHash: string | undefined;

      if (enableStellarAnchor) {
        const anchorResult = await anchor(body);
        if (anchorResult.success && anchorResult.txHash) {
          txHash = anchorResult.txHash;
          setStellarTxHash(txHash);
        } else {
          setSubmitError(getAnchorFailureMessage(anchorResult.error));
          return;
        }
      }

      await apiClient.post("/confessions", {
        title: title || undefined,
        body,
        message: body,
        gender,
        stellarTxHash: txHash,
      });

      setSubmitSuccess(true);
      setDraftSubmittedAt(Date.now());
      toast.success("Confession submitted successfully!");

      if (onSubmit) {
        onSubmit({
          title,
          body,
          gender,
          enableStellarAnchor,
          stellarTxHash: txHash,
        });
      }

      setTitle("");
      setBody("");
      setGender(undefined);
      setEnableStellarAnchor(false);
      setErrors({});
      setSubmitError(null);
      setStellarTxHash(null);
      setIsPreviewMode(false);

      if (submitSuccessTimerRef.current) {
        clearTimeout(submitSuccessTimerRef.current);
      }

      submitSuccessTimerRef.current = setTimeout(() => {
        setSubmitSuccess(false);
      }, 2000);
    } catch (error) {
      const errorMessage = getSafeSubmissionErrorMessage(error);
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isPreviewMode) return;

    const closePreviewOnEscPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsPreviewMode(false);

        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    };

    window.addEventListener("keydown", closePreviewOnEscPress);
    return () => {
      window.removeEventListener("keydown", closePreviewOnEscPress);
    };
  }, [isPreviewMode]);

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[34px] border border-[var(--border)] bg-[linear-gradient(180deg,var(--surface-strong),var(--surface))] p-0 shadow-[0_30px_90px_-52px_rgba(28,36,48,0.2)]",
        className
      )}
    >
      <CardHeader className="border-b border-[var(--border)] px-6 pb-6 pt-7 sm:px-8">
        <p className="eyebrow">Writing desk</p>
        <CardTitle className="mt-3 text-4xl sm:text-5xl">
          Share your confession
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-8 sm:text-base">
          Write with privacy, clarity, and restraint. This space is designed to
          feel more like a journal entry than a social post composer.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 py-7 sm:px-8">
        {newerCloudDraft && (
          <div className="mb-6 flex flex-col justify-between gap-4 rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-[var(--foreground)]">
                A newer draft was found from another device or tab.
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--secondary)]">
                Load it here to avoid losing progress.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewerCloudDraft(null)}
              >
                Dismiss
              </Button>
              <Button size="sm" onClick={recoverCloudDraft}>
                <CloudDownload className="h-4 w-4" />
                Load draft
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7">
          <div>
            <label
              htmlFor="confession-title"
              className="mb-2 block text-sm font-medium text-[var(--foreground)]"
            >
              Title <span className="text-[var(--secondary)]">(optional)</span>
            </label>
            <p id={TITLE_HINT_ID} className="mb-2 text-xs text-[var(--secondary)]">
              Optional. Keep it under 200 characters.
            </p>
            <Input
              id="confession-title"
              type="text"
              placeholder="Give your confession a title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={!!errors.title}
              maxLength={200}
              aria-describedby={`${TITLE_HINT_ID}${errors.title ? ` ${TITLE_ERROR_ID}` : ""} title-counter`}
              aria-required="false"
            />
            <div className="mt-2 flex items-center justify-between">
              {errors.title ? (
                <p id={TITLE_ERROR_ID} className="text-xs text-red-500" role="alert">
                  {errors.title}
                </p>
              ) : (
                <div />
              )}
              <CharacterCounter
                current={title.length}
                max={200}
                id="title-counter"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <label
                htmlFor="confession-body"
                className="block text-sm font-medium text-[var(--foreground)]"
              >
                Confession <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <DraftManager
                  currentDraft={{ title, body, gender }}
                  onLoadDraft={handleLoadDraft}
                  submittedAt={draftSubmittedAt}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                  aria-label={
                    isPreviewMode
                      ? "Switch to edit mode"
                      : "Switch to preview mode"
                  }
                >
                  {isPreviewMode ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span className="hidden sm:inline">Preview</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {isPreviewMode ? (
              <PreviewPanel title={title} body={body} />
            ) : (
              <>
                <p
                  id={BODY_HINT_ID}
                  className="mb-2 text-xs leading-6 text-[var(--secondary)]"
                >
                  Minimum 10 characters. Markdown formatting is supported.
                </p>
                <div className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] p-2">
                  <FormattingToolbar
                    textareaRef={textareaRef}
                    onTextChange={handleTextChange}
                  />
                </div>
                <textarea
                  id="confession-body"
                  ref={textareaRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Share your thoughts, feelings, or experiences..."
                  aria-invalid={!!errors.body}
                  className={cn(
                    "mt-3 flex min-h-[260px] w-full resize-y rounded-[28px] border px-5 py-5 text-[15px] leading-8 text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
                    "bg-[linear-gradient(180deg,var(--surface-strong),var(--surface-muted))]",
                    "placeholder:text-[color:rgba(111,101,89,0.78)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                    errors.body
                      ? "border-red-500"
                      : "border-[var(--border)] focus-visible:border-[var(--primary)]"
                  )}
                  maxLength={5000}
                  aria-describedby={`${BODY_HINT_ID}${errors.body ? ` ${BODY_ERROR_ID}` : ""} body-counter`}
                  aria-required="true"
                />
                <div className="mt-2 flex items-center justify-between">
                  {errors.body ? (
                    <p id={BODY_ERROR_ID} className="text-xs text-red-500" role="alert">
                      {errors.body}
                    </p>
                  ) : (
                    <div />
                  )}
                  <CharacterCounter
                    current={body.length}
                    max={5000}
                    id="body-counter"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="mb-3 block text-sm font-medium text-[var(--foreground)]">
              Gender <span className="text-[var(--secondary)]">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {Object.values(Gender).map((g) => (
                <label
                  key={g}
                  htmlFor={g}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors",
                    gender === g
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--secondary)] hover:bg-[var(--surface-strong)]"
                  )}
                >
                  <input
                    type="radio"
                    name="gender"
                    id={g}
                    value={g}
                    checked={gender === g}
                    onChange={() => setGender(g)}
                    className="sr-only"
                  />
                  {g}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <StellarAnchorToggle
              enabled={enableStellarAnchor}
              onToggle={setEnableStellarAnchor}
              transactionHash={stellarTxHash}
            />
          </div>

          {submitError && (
            <div
              className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {submitSuccess && (
            <div
              className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3"
              role="alert"
            >
              <p className="text-sm text-emerald-700">
                Confession submitted successfully!
              </p>
            </div>
          )}

          <div className="flex flex-col justify-end gap-3 border-t border-[var(--border)] pt-6 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (submitSuccessTimerRef.current) {
                  clearTimeout(submitSuccessTimerRef.current);
                }
                resetComposerState();
              }}
              disabled={isSubmitting}
              className="min-h-[44px]"
            >
              Clear draft
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || hasValidationErrors}
              aria-busy={isSubmitting}
              className="min-h-[48px] min-w-[160px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing confession...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Publish confession
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
