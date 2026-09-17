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
import { Draft } from "@/app/lib/hooks/useDrafts";
import { Eye, EyeOff, Send, Loader2, LockKeyhole } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import apiClient from "@/app/lib/api/client";
import { useGlobalToast } from "@/app/components/common/Toast";
import { clearPendingConfession, loadPendingConfession } from "@/app/lib/utils/pendingConfession";
import { useAuth } from "@/app/lib/hooks/useAuth";


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
      const retryAfter = Number(error.response?.data?.retryAfter);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const seconds = Math.ceil(retryAfter);
        return `You are submitting too quickly. Please wait ${seconds} second${seconds === 1 ? "" : "s"} and try again.`;
      }
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
  const [stellarWalletPin, setStellarWalletPin] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const submitSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { anchor, publicKey, isEmbeddedWallet } = useStellarWallet();
  const toast = useGlobalToast();

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    const pending = loadPendingConfession();
    if (!pending) return;
    setTitle(pending.title || "");
    setBody(pending.body);
    setGender(pending.gender);
    setEnableStellarAnchor(Boolean(pending.enableStellarAnchor));
    toast.info("Your confession draft is restored. Review it, then publish when ready.");
    clearPendingConfession();
  }, [isAuthenticated, isAuthLoading, toast]);

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
    setStellarWalletPin("");
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

      if (enableStellarAnchor && publicKey) {
        const anchorResult = await anchor(body, stellarWalletPin);
        if (anchorResult.success && anchorResult.txHash) {
          txHash = anchorResult.txHash;
          setStellarTxHash(txHash);
        } else {
          const anchorMessage = getAnchorFailureMessage(anchorResult.error);
          toast.info(`${anchorMessage} Publishing without an anchor.`);
        }
      }

      await apiClient.post(
        "/api/confessions",
        {
          title: title || undefined,
          body,
          message: body,
          gender,
          stellarTxHash: txHash,
        },
        {
          headers: publicKey ? { "x-stellar-wallet": publicKey } : undefined,
        },
      );

      if (typeof window !== "undefined" && publicKey) {
        const key = "xconfess.wallet.confessions." + publicKey;
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        localStorage.setItem(key, JSON.stringify([{ id: String(Date.now()), title, body, createdAt: new Date().toISOString(), stellarTxHash: txHash }, ...existing].slice(0, 100)));
      }

      setSubmitSuccess(true);
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
    setStellarWalletPin("");
      setErrors({});
      setSubmitError(null);
      setStellarTxHash(null);
      setIsPreviewMode(false);
      clearPendingConfession();

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
        "overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--surface-strong),var(--surface))] p-0 shadow-[0_30px_90px_-52px_rgba(0,0,0,0.72)]",
        className
      )}
    >
      <CardHeader className="border-b border-[var(--border)] px-6 pb-6 pt-7 sm:px-8">
        <p className="eyebrow">Writing desk</p>
        <CardTitle className="mt-3 text-[2rem] leading-tight sm:text-4xl">
          Share your confession
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-7 sm:text-base">
          Your story matters. Be honest, be real, be you.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 py-5 sm:px-7 sm:py-6">
        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Confession composition form">
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
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
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
                Confession <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <div className="flex items-center gap-2">
                <DraftManager
                  currentDraft={{ title, body, gender }}
                  onLoadDraft={handleLoadDraft}
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
                  title={isPreviewMode ? "Switch to edit mode" : "Switch to preview mode"}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  {isPreviewMode ? (
                    <>
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Edit</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Preview</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {isPreviewMode ? (
              <div tabIndex={0} role="region" aria-label="Confession preview">
                <PreviewPanel title={title} body={body} />
              </div>
            ) : (
              <>
                <p
                  id={BODY_HINT_ID}
                  className="mb-2 text-xs leading-6 text-[var(--secondary)]"
                >
                  Minimum 10 characters. Markdown formatting is supported.
                </p>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2">
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
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      const form = e.currentTarget.form;
                      if (form) {
                        form.requestSubmit();
                      }
                    }
                  }}
                  placeholder="Share your thoughts, feelings, or experiences..."
                  aria-invalid={!!errors.body}
                  className={cn(
                    "mt-3 flex min-h-[128px] w-full resize-y rounded-2xl border px-5 py-5 text-[15px] leading-8 text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                    "bg-[linear-gradient(180deg,var(--surface-strong),var(--surface-muted))]",
                    "placeholder:text-[color:rgba(169,160,149,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
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

          <fieldset className="border-0 p-0 m-0">
            <legend className="mb-3 block text-sm font-medium text-[var(--foreground)]">
              Gender <span className="text-[var(--secondary)]">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Gender selection">
              {Object.values(Gender).map((g) => (
                <label
                  key={g}
                  htmlFor={g}
                  className={cn(
                    "cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-[var(--primary)]",
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
                    aria-label={g}
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                        {enableStellarAnchor && isEmbeddedWallet && (
              <label className="mt-4 block text-sm text-[var(--secondary)]">
                Wallet PIN for local Stellar proof signing
                <input type="password" inputMode="numeric" value={stellarWalletPin} onChange={(event) => setStellarWalletPin(event.target.value)} placeholder="Required to sign locally" aria-label="Wallet PIN for Stellar proof" className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--foreground)]" />
              </label>
            )}

            <StellarAnchorToggle
              enabled={enableStellarAnchor}
              onToggle={setEnableStellarAnchor}
              transactionHash={stellarTxHash}
            />
          </div>

          {submitError && (
            <div
              className="rounded-xl border border-red-500/25 bg-red-950/30 px-4 py-3"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm text-red-200">{submitError}</p>
            </div>
          )}

          {submitSuccess && (
            <div
              className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm text-emerald-200">
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
                clearPendingConfession();
              }}
              disabled={isSubmitting}
              aria-label="Clear draft and reset form"
              className="min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              Clear draft
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || hasValidationErrors}
              aria-busy={isSubmitting}
              aria-label={isSubmitting ? "Publishing confession..." : "Publish confession"}
              className="min-h-[48px] min-w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Publishing confession...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
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