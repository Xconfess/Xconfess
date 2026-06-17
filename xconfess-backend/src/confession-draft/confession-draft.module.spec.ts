import { ConfessionDraftController } from './confession-draft.controller';
import { ConfessionDraftModule } from './confession-draft.module';
import { ConfessionDraftQueue } from './confession-draft.queue';
import { ConfessionDraftService } from './confession-draft.service';

describe('ConfessionDraftModule', () => {
  it('exposes draft API controller and queue-backed providers', () => {
    const controllers =
      Reflect.getMetadata('controllers', ConfessionDraftModule) ?? [];
    const providers =
      Reflect.getMetadata('providers', ConfessionDraftModule) ?? [];

    expect(controllers).toContain(ConfessionDraftController);
    expect(providers).toEqual(
      expect.arrayContaining([ConfessionDraftService, ConfessionDraftQueue]),
    );
  });
});
