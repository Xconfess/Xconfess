const { validateDeploymentMetadataSchema } = require('../verify-contract-env');

describe('Deployment Metadata Schema Validation (#1738)', () => {
  const validDeployment = {
    network: 'testnet',
    generated_at_utc: '2026-08-22T10:41:02Z',
    target: 'wasm32v1-none',
    contracts: {
      'confession-anchor': {
        contract_id: 'CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB',
        sha256: 'fc4f4e6ccb4b38ad71ace722a69dc3470a675d3f112788abba94bb3b443ce7d7',
        source: 'xconfess-deployer',
        version: '0.1.0',
        wasm_file: 'target/wasm32v1-none/release/confession_anchor.wasm',
      },
    },
  };

  it('validates a correct deployment metadata object', () => {
    const result = validateDeploymentMetadataSchema(validDeployment);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing network field', () => {
    const invalid = { ...validDeployment, network: '' };
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('missing valid "network"')]),
    );
  });

  it('rejects invalid generated_at_utc timestamp', () => {
    const invalid = { ...validDeployment, generated_at_utc: 'not-a-date' };
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('must be a valid ISO 8601 UTC date string')]),
    );
  });

  it('rejects invalid contract_id format', () => {
    const invalid = {
      ...validDeployment,
      contracts: {
        'confession-anchor': {
          ...validDeployment.contracts['confession-anchor'],
          contract_id: 'INVALID_CONTRACT_ID',
        },
      },
    };
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('missing or invalid "contract_id"')]),
    );
  });

  it('rejects invalid sha256 checksum', () => {
    const invalid = {
      ...validDeployment,
      contracts: {
        'confession-anchor': {
          ...validDeployment.contracts['confession-anchor'],
          sha256: 'not-64-hex-chars',
        },
      },
    };
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('missing or invalid "sha256"')]),
    );
  });

  it('rejects invalid wasm filename without .wasm extension', () => {
    const invalid = {
      ...validDeployment,
      contracts: {
        'confession-anchor': {
          ...validDeployment.contracts['confession-anchor'],
          wasm_file: 'target/release/confession_anchor',
        },
      },
    };
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('must have a valid "wasm_file" path ending with .wasm')]),
    );
  });
});
