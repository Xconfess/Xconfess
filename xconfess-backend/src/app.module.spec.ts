import { AppModule } from './app.module';
import { CommentModule } from './comment/comment.module';

describe('AppModule', () => {
  it('registers the comment module so comment API routes are mounted', () => {
    const imports = Reflect.getMetadata('imports', AppModule) ?? [];

    expect(imports).toContain(CommentModule);
  });
});
