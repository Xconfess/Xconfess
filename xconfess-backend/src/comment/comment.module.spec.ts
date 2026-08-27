import { AnonymousContextMiddleware } from '../middleware/anonymous-context.middleware';
import { CommentAdminController } from './comment-admin.controller';
import { CommentController } from './comment.controller';
import { CommentModule } from './comment.module';

describe('CommentModule', () => {
  it('exposes comment API controllers', () => {
    const controllers = Reflect.getMetadata('controllers', CommentModule) ?? [];
    expect(controllers).toEqual(
      expect.arrayContaining([CommentController, CommentAdminController]),
    );
  });

  it('applies anonymous context middleware to comment routes', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });
    new CommentModule().configure({ apply } as any);
    expect(apply).toHaveBeenCalledWith(AnonymousContextMiddleware);
    expect(forRoutes).toHaveBeenCalledWith('comments');
  });
});