import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/app/lib/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock('@/app/lib/hooks/useAuth', () => ({
  useAuth: () => ({
    login: jest.fn(),
  }),
}));

jest.mock('@/app/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/app/components/ui/input', () => ({
  Input: ({ ...props }: any) => <input {...props} />,
}));

describe('Login page register navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Create account button routes to /register without calling the backend', async () => {
    const user = userEvent.setup();
    const apiClient = require('@/app/lib/api/client').default;
    const LoginPage = (await import('@/app/(auth)/login/page')).default;

    render(<LoginPage />);

    const createAccountButton = screen.getByRole('button', { name: /create account/i });
    expect(createAccountButton).toBeInTheDocument();

    await user.click(createAccountButton);

    expect(mockPush).toHaveBeenCalledWith('/register');
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
