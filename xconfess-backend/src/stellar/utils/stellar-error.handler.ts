// src/stellar/utils/stellar-error.handler.ts
// Centralized error handler for Stellar/Soroban integration

import {
  classifyContractError,
  ContractErrorClassification,
  getContractErrorMessage,
  getHttpStatusForContractError,
  isRetryableContractError,
  ANCHOR_ERROR_CODES,
  TIPPING_ERROR_CODES,
  CONTRACT_ERROR_CODES,
} from './stellar-contract-errors';

// ---- Stellar Transaction Error Classes ----

export class StellarTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarTimeoutError';
  }
}

export class StellarInvalidSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarInvalidSignatureError';
  }
}

export class StellarMalformedTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarMalformedTransactionError';
  }
}

export class StellarNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarNetworkError';
  }
}

// ---- Contract Error Response ----

export interface ContractErrorResponse {
  code: number;
  name: string;
  classification: ContractErrorClassification;
  message: string;
  httpStatus: number;
  retryable: boolean;
}

export class StellarContractError extends Error {
  public readonly code: number;
  public readonly classification: ContractErrorClassification;
  public readonly httpStatus: number;
  public readonly retryable: boolean;

  constructor(
    code: number,
    message: string,
    classification: ContractErrorClassification = ContractErrorClassification.UNKNOWN,
    httpStatus?: number,
  ) {
    super(message);
    this.name = 'StellarContractError';
    this.code = code;
    this.classification = classification;
    this.httpStatus = httpStatus ?? getHttpStatusForContractError(code);
    this.retryable = classification === ContractErrorClassification.RETRYABLE;
  }

  toResponse(): ContractErrorResponse {
    return {
      code: this.code,
      name: this.name,
      classification: this.classification,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
    };
  }
}

// ---- Client-Safe Error Messages ----

const CLIENT_SAFE_MESSAGES: Record<number, string> = {
  // Anchor / global errors
  [ANCHOR_ERROR_CODES.UNAUTHORIZED]: 'You are not authorized to perform this action. Please check your wallet or permissions.',
  [ANCHOR_ERROR_CODES.NOT_FOUND]: 'The requested resource was not found. It may have been removed or never existed.',
  [ANCHOR_ERROR_CODES.INVALID_INPUT]: 'The input provided is invalid. Please check your data and try again.',
  [ANCHOR_ERROR_CODES.OVERFLOW]: 'A numeric overflow occurred. Please try again with a smaller value.',
  [ANCHOR_ERROR_CODES.COOLDOWN_ACTIVE]: 'Please wait before performing this action again. The cooldown period is still active.',
  [ANCHOR_ERROR_CODES.PAYLOAD_TOO_LARGE]: 'The data submitted exceeds the maximum allowed size. Please reduce the payload.',
  [ANCHOR_ERROR_CODES.METADATA_TOO_LONG]: 'The metadata provided exceeds the maximum length. Please shorten it.',

  // Confession errors
  [ANCHOR_ERROR_CODES.CONFESSION_EXISTS]: 'This confession has already been recorded. Duplicate submissions are not allowed.',
  [ANCHOR_ERROR_CODES.CONFESSION_EMPTY]: 'Confession content cannot be empty. Please write a message.',
  [ANCHOR_ERROR_CODES.CONFESSION_TOO_LONG]: 'The confession is too long. Please shorten your message.',

  // Reaction errors
  [ANCHOR_ERROR_CODES.REACTION_EXISTS]: 'You have already reacted to this confession.',
  [ANCHOR_ERROR_CODES.INVALID_REACTION_TYPE]: 'This reaction type is not supported.',

  // Report errors
  [ANCHOR_ERROR_CODES.REPORT_EXISTS]: 'This confession has already been reported.',
  [ANCHOR_ERROR_CODES.INVALID_REPORT_REASON]: 'The report reason provided is not valid.',
  [ANCHOR_ERROR_CODES.REPORT_REASON_TOO_LONG]: 'The report reason is too long. Please shorten it.',

  // Governance errors
  [ANCHOR_ERROR_CODES.PROPOSAL_NOT_FOUND]: 'The governance proposal was not found.',
  [ANCHOR_ERROR_CODES.UNAUTHORIZED_APPROVAL]: 'You are not authorized to approve this proposal.',
  [ANCHOR_ERROR_CODES.QUORUM_NOT_REACHED]: 'The required quorum for this proposal has not been reached.',
  [ANCHOR_ERROR_CODES.ALREADY_APPROVED]: 'This proposal has already been approved.',
  [ANCHOR_ERROR_CODES.ALREADY_EXECUTED]: 'This proposal has already been executed.',
  [ANCHOR_ERROR_CODES.INVALID_ACTION]: 'The proposed action is not valid.',

  // Tipping errors
  [TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT]: 'The tip amount is invalid. Please enter a valid amount.',
  [TIPPING_ERROR_CODES.METADATA_TOO_LONG]: 'The tip metadata is too long. Please shorten it.',
  [TIPPING_ERROR_CODES.TOTAL_OVERFLOW]: 'The total tip amount has exceeded the maximum. Please try a smaller amount.',
  [TIPPING_ERROR_CODES.NONCE_OVERFLOW]: 'Too many tips sent. Please wait and try again.',
  [TIPPING_ERROR_CODES.UNAUTHORIZED]: 'You are not authorized to send this tip.',
  [TIPPING_ERROR_CODES.CONTRACT_PAUSED]: 'Tipping is temporarily paused. Please try again later.',
  [TIPPING_ERROR_CODES.RATE_LIMITED]: 'You are sending tips too quickly. Please wait before trying again.',
  [TIPPING_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG]: 'The rate limit configuration is invalid. Please contact support.',
};

// ---- Contract Error Functions ----

export function getClientSafeContractErrorMessage(errorCode: number): string {
  return CLIENT_SAFE_MESSAGES[errorCode]
    ?? getContractErrorMessage(errorCode)
    ?? `An unexpected contract error occurred (code ${errorCode}). Please try again.`;
}

export function handleStellarContractError(errorCode: number): StellarContractError {
  const classification = classifyContractError(errorCode);
  const message = getClientSafeContractErrorMessage(errorCode);
  return new StellarContractError(errorCode, message, classification);
}

// ---- Transaction Error Handler ----

export function handleStellarError(error: any): Error {
  // Map specific error messages
  const errorMsg = error.message?.toLowerCase() || '';
  if (errorMsg.includes('timeout')) {
    return new StellarTimeoutError('Stellar transaction timed out');
  }
  if (errorMsg.includes('signature') || errorMsg.includes('bad_auth')) {
    return new StellarInvalidSignatureError(
      'Invalid Stellar transaction signature',
    );
  }
  if (errorMsg.includes('tx_bad_seq') || errorMsg.includes('malformed')) {
    return new StellarMalformedTransactionError(
      'Malformed Stellar transaction',
    );
  }

  // Map result codes from horizon
  if (error.response?.data?.extras?.result_codes) {
    const codes = error.response.data.extras.result_codes;
    const txCode = codes.transaction;

    if (txCode === 'tx_bad_auth') {
      return new StellarInvalidSignatureError(
        'Invalid Stellar transaction signature',
      );
    }
    if (txCode === 'tx_bad_seq' || txCode === 'tx_malformed') {
      return new StellarMalformedTransactionError(
        'Malformed Stellar transaction',
      );
    }

    return new StellarNetworkError(`Stellar error: ${JSON.stringify(codes)}`);
  }

  if (error.response?.data?.detail) {
    return new StellarNetworkError(
      `Stellar error: ${error.response.data.detail}`,
    );
  }

  return new StellarNetworkError(`Stellar error: ${error.message || error}`);
}
