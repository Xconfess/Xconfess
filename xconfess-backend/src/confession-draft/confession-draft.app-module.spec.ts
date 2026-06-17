import { AppModule } from '../app.module';
import { ConfessionDraftModule } from './confession-draft.module';

describe('AppModule confession draft wiring', () => {
  it('registers the confession draft module so draft API routes are mounted', () => {
    const imports = Reflect.getMetadata('imports', AppModule) ?? [];

    expect(imports).toContain(ConfessionDraftModule);
  });
});
