import * as fs from 'fs';
import * as path from 'path';
import {
  ContractErrorClassification,
  TIPPING_ERROR_CODES,
  classifyContractError,
  getContractErrorMessage,
  getHttpStatusForContractError,
} from '../stellar-contract-errors';
import { getClientSafeContractErrorMessage } from '../stellar-error.handler';

/**
 * Parity between the backend tipping registry and the contract registry
 * (issue #2211). `CONTRACT_ERROR_CODES.md` is the document that contract
 * tests in Rust also parse, so both sides are checked against one source.
 */
const REGISTRY_PATH = path.resolve(
  __dirname,
  '../../../../../xconfess-contracts/CONTRACT_ERROR_CODES.md',
);

interface DocumentedTippingError {
  code: number;
  name: string;
  classification: string;
  httpStatus: number;
}

const CLASSIFICATION_BY_LABEL: Record<string, ContractErrorClassification> = {
  Terminal: ContractErrorClassification.TERMINAL,
  Retryable: ContractErrorClassification.RETRYABLE,
  Unknown: ContractErrorClassification.UNKNOWN,
};

function readDocumentedTippingErrors(): DocumentedTippingError[] {
  return fs
    .readFileSync(REGISTRY_PATH, 'utf8')
    .split('\n')
    .flatMap((line) => {
      // | 6001 | `NAME` | Terminal | description | 400 |
      // The range summary row (| 6000–6099 | ...) is skipped: only a plain
      // numeric code in the tipping range is a registry row.
      const cells = line.split('|').map((cell) => cell.trim());
      const code = /^\d+$/.test(cells[1] ?? '') ? Number(cells[1]) : NaN;
      if (!(code >= 6000 && code <= 6099)) {
        return [];
      }
      return [
        {
          code,
          name: cells[2].replace(/`/g, ''),
          classification: cells[3],
          httpStatus: Number(cells[5]),
        },
      ];
    });
}

describe('Contract error registry parity (#2211)', () => {
  const documented = readDocumentedTippingErrors();

  it('documents exactly the tipping codes the backend registers', () => {
    const registered = Object.values(TIPPING_ERROR_CODES).sort((a, b) => a - b);
    const documentedCodes = documented.map((row) => row.code).sort((a, b) => a - b);

    expect(documentedCodes).toEqual(registered);
  });

  it.each(documented)('uses the documented name for $code ($name)', ({ code, name }) => {
    const registeredName = Object.entries(TIPPING_ERROR_CODES).find(
      ([, value]) => value === code,
    )?.[0];

    expect(registeredName).toBe(name);
  });

  it.each(documented)(
    'matches the documented classification and HTTP status for $name',
    ({ code, classification, httpStatus }) => {
      expect(CLASSIFICATION_BY_LABEL[classification]).toBeDefined();
      expect(classifyContractError(code)).toBe(CLASSIFICATION_BY_LABEL[classification]);
      expect(getHttpStatusForContractError(code)).toBe(httpStatus);
    },
  );

  it.each(documented)('has an explicit safe client message for $name', ({ code }) => {
    const message = getClientSafeContractErrorMessage(code);

    expect(message).not.toBe(getContractErrorMessage(code));
    expect(message).not.toMatch(/unknown contract error|unexpected contract error/i);
    expect(message).not.toMatch(/panic|unwrap|::|\.rs|[{}]/i);
    expect(message.length).toBeLessThanOrEqual(120);
  });
});
