import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController(
      new AppService(),
      { check: jest.fn() } as any,
      { pingCheck: jest.fn() } as any,
      { isHealthy: jest.fn() } as any,
      { isHealthy: jest.fn() } as any,
      { getDiagnostics: jest.fn() } as any,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
