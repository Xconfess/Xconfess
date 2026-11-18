const fs = require('fs');
const path = require('path');
const { validateDeploymentMetadataSchema } = require('../verify-contract-env');

const TESTNET_METADATA_PATH = path.resolve(__dirname, '../../deployments/testnet.json');

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
      'confession-registry': {
        contract_id: 'CDS3WZ2CBA2JAIGK2NJ7KOO3VPBFWSJ34FWMMVXEIA7O7ACQO3VWH2PQ',
        sha256: '0a4708682d777075100f5fb7f4e6d3222fef83ccf49a252b0f49c5167bcdfdce',
        source: 'xconfess-deployer',
        version: '0.1.0',
        wasm_file: 'target/wasm32v1-none/release/confession_registry.wasm',
      },
      'anonymous-tipping': {
        contract_id: 'CC74UWNAAYDTPEPVKR4CPANWJSF6GI2PCI7BLN6M46KB6CSQYVYLHIWM',
        sha256: '38c3d5d76bc026a1a3d25dabc473d9b37a2dd60787145400a1bb327624b76928',
        source: 'xconfess-deployer',
        version: '1.0.0',
        wasm_file: 'target/wasm32v1-none/release/anonymous_tipping.wasm',
      },
      'reputation-badges': {
        contract_id: 'CDAN4HZHY6XNQR3TRPLPJKVKNURVMMQMF7XNZ6AUNJNFLR77J4DNAEYI',
        sha256: 'a1737b45c44ded77f714769f3a16fcfb876ae0658e3db5262cc7d64d9c3274f7',
        source: 'xconfess-deployer',
        version: '0.0.0',
        wasm_file: 'target/wasm32v1-none/release/reputation_badges.wasm',
      },
    },
  };

  // Copy with one contract entry replaced by `patch` (merged over the original).
  const withContract = (name, patch) => ({
    ...validDeployment,
    contracts: {
      ...validDeployment.contracts,
      [name]: { ...validDeployment.contracts[name], ...patch },
    },
  });

  it('validates a correct deployment metadata object', () => {
    const result = validateDeploymentMetadataSchema(validDeployment);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates the committed testnet deployment metadata', () => {
    const committed = JSON.parse(fs.readFileSync(TESTNET_METADATA_PATH, 'utf8'));
    const result = validateDeploymentMetadataSchema(committed);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
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
    const invalid = withContract('confession-anchor', { contract_id: 'INVALID_CONTRACT_ID' });
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('missing or invalid "contract_id"')]),
    );
  });

  it('rejects invalid sha256 checksum', () => {
    const invalid = withContract('confession-anchor', { sha256: 'not-64-hex-chars' });
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('missing or invalid "sha256"')]),
    );
  });

  it('rejects invalid wasm filename without .wasm extension', () => {
    const invalid = withContract('confession-anchor', {
      wasm_file: 'target/release/confession_anchor',
    });
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('must have a valid "wasm_file" path ending with .wasm')]),
    );
  });

  it('rejects placeholder values copied from the redacted sample', () => {
    const placeholder = {
      network: '<stellar-network-alias>',
      generated_at_utc: 'YYYY-MM-DDTHH:MM:SSZ',
      target: 'wasm32-unknown-unknown',
      contracts: {
        'confession-anchor': {
          contract_id: `C${'X'.repeat(51)}ANCH`,
          sha256: '0000000000000000000000000000000000000000000000000000000000000002',
          source: '<stellar-cli-key-alias>',
          version: '0.1.0',
          wasm_file: 'target/wasm32-unknown-unknown/release/confession_anchor.wasm',
        },
      },
    };
    const result = validateDeploymentMetadataSchema(placeholder);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"network" must be a Stellar CLI network alias'),
        expect.stringContaining('placeholder "contract_id"'),
        expect.stringContaining('placeholder "sha256"'),
        expect.stringContaining('placeholder "source"'),
      ]),
    );
  });

  it('rejects low-entropy sha256 values even when well formed', () => {
    const invalid = withContract('confession-anchor', { sha256: `${'0'.repeat(63)}1` });
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('placeholder "sha256"')]),
    );
  });

  it('requires every release contract to be present', () => {
    const { 'reputation-badges': _omitted, ...contracts } = validDeployment.contracts;
    const result = validateDeploymentMetadataSchema({ ...validDeployment, contracts });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing required contract entry "reputation-badges"'),
      ]),
    );
  });

  it('rejects contract entries outside the release set', () => {
    const invalid = {
      ...validDeployment,
      contracts: { ...validDeployment.contracts, confession_anchor: validDeployment.contracts['confession-anchor'] },
    };
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Unexpected contract entry "confession_anchor"')]),
    );
  });

  it('requires versions to be MAJOR.MINOR.PATCH', () => {
    const invalid = withContract('confession-anchor', { version: '1.0' });
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('version must be MAJOR.MINOR.PATCH')]),
    );
  });

  it('requires wasm_file to name the artifact for that contract', () => {
    const invalid = withContract('confession-anchor', {
      wasm_file: 'target/wasm32v1-none/release/confession_registry.wasm',
    });
    const result = validateDeploymentMetadataSchema(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('must be a release artifact named "confession_anchor.wasm"')]),
    );
  });
});
