/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageComposer } from '../MessageComposer';

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof MessageComposer>> = {},
) {
  const onChange = jest.fn();
  const onSend = jest.fn();
  const onDiscard = jest.fn();

  const utils = render(
    <MessageComposer
      value=""
      onChange={onChange}
      onSend={onSend}
      onDiscard={onDiscard}
      placeholder="Send encrypted message..."
      label="Send encrypted message"
      {...overrides}
    />,
  );

  return { ...utils, onChange, onSend, onDiscard };
}

describe('MessageComposer', () => {
  it('renders the current text of the conversation', () => {
    renderComposer({ value: 'unsent text' });

    expect(screen.getByLabelText('Send encrypted message')).toHaveValue(
      'unsent text',
    );
  });

  it('reports every keystroke so the draft can be stored', () => {
    const { onChange } = renderComposer();

    fireEvent.change(screen.getByLabelText('Send encrypted message'), {
      target: { value: 'h' },
    });

    expect(onChange).toHaveBeenCalledWith('h');
  });

  it('sends the message when the send button is clicked', () => {
    const { onSend } = renderComposer({ value: 'hello' });

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('sends the message when Enter is pressed in the field', () => {
    const { onSend } = renderComposer({ value: 'hello' });

    fireEvent.keyDown(screen.getByLabelText('Send encrypted message'), {
      key: 'Enter',
    });

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('cannot send an empty message', () => {
    const { onSend } = renderComposer({ value: '   ' });

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();

    fireEvent.keyDown(screen.getByLabelText('Send encrypted message'), {
      key: 'Enter',
    });

    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('MessageComposer — draft handling', () => {
  it('shows the draft notice and the discard control while a draft is held', () => {
    renderComposer({ value: 'unsent text', hasDraft: true });

    expect(screen.getByText('Draft saved for this conversation.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Discard unsent message' }),
    ).toBeInTheDocument();
  });

  it('hides the discard control when there is no draft', () => {
    renderComposer({ value: '', hasDraft: false });

    expect(
      screen.queryByRole('button', { name: 'Discard unsent message' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Draft saved for this conversation.'),
    ).not.toBeInTheDocument();
  });

  it('throws the draft away when the discard control is used', () => {
    const { onDiscard, onSend } = renderComposer({
      value: 'unsent text',
      hasDraft: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Discard unsent message' }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('MessageComposer — disabled state', () => {
  it('disables the field and the send button while the message is being sent', () => {
    renderComposer({ value: 'hello', isSending: true });

    expect(screen.getByLabelText('Send encrypted message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('disables the field and the send button while the composer is unavailable', () => {
    renderComposer({ value: 'hello', disabled: true });

    expect(screen.getByLabelText('Send encrypted message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});

describe('MessageComposer — offline feedback', () => {
  it('explains that sending is unavailable when offline', () => {
    renderComposer({ value: 'hello', isOffline: true });

    expect(screen.getByTestId('composer-offline-status')).toHaveTextContent(
      /offline/i,
    );
    expect(screen.getByTestId('composer-offline-status')).toHaveTextContent(
      /draft is saved/i,
    );
  });

  it('disables the field and the send button when offline', () => {
    renderComposer({ value: 'hello', isOffline: true });

    expect(screen.getByLabelText('Send encrypted message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('does not fire onSend when Enter is pressed while offline (no false success)', () => {
    const { onSend } = renderComposer({ value: 'hello', isOffline: true });

    fireEvent.keyDown(screen.getByLabelText('Send encrypted message'), {
      key: 'Enter',
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not fire onSend when the send button is clicked while offline', () => {
    const { onSend } = renderComposer({ value: 'hello', isOffline: true });

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('keeps the draft text visible across the offline transition', () => {
    const { rerender } = render(
      <MessageComposer
        value="half-typed thought"
        onChange={jest.fn()}
        onSend={jest.fn()}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={false}
      />,
    );

    expect(screen.getByLabelText('Send encrypted message')).toHaveValue(
      'half-typed thought',
    );

    rerender(
      <MessageComposer
        value="half-typed thought"
        onChange={jest.fn()}
        onSend={jest.fn()}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={true}
      />,
    );

    expect(screen.getByLabelText('Send encrypted message')).toHaveValue(
      'half-typed thought',
    );
  });

  it('hides the offline status once connectivity returns', () => {
    const { rerender } = render(
      <MessageComposer
        value="hello"
        onChange={jest.fn()}
        onSend={jest.fn()}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={true}
      />,
    );

    expect(screen.getByTestId('composer-offline-status')).toBeInTheDocument();

    rerender(
      <MessageComposer
        value="hello"
        onChange={jest.fn()}
        onSend={jest.fn()}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={false}
      />,
    );

    expect(
      screen.queryByTestId('composer-offline-status'),
    ).not.toBeInTheDocument();
  });
});

describe('MessageComposer — reconnect flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderOfflineThenOnline(
    initialValue = 'hello',
    extra: Partial<React.ComponentProps<typeof MessageComposer>> = {},
  ) {
    const onSend = jest.fn();
    const utils = render(
      <MessageComposer
        value={initialValue}
        onChange={jest.fn()}
        onSend={onSend}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={true}
        {...extra}
      />,
    );
    utils.rerender(
      <MessageComposer
        value={initialValue}
        onChange={jest.fn()}
        onSend={onSend}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={false}
        {...extra}
      />,
    );
    return { ...utils, onSend };
  }

  it('shows a brief "back online" confirmation after reconnect', () => {
    renderOfflineThenOnline();

    expect(
      screen.getByTestId('composer-reconnected-status'),
    ).toHaveTextContent(/back online/i);
  });

  it('dismisses the reconnect confirmation after a few seconds', () => {
    renderOfflineThenOnline();

    expect(
      screen.getByTestId('composer-reconnected-status'),
    ).toBeInTheDocument();

    jest.advanceTimersByTime(3500);

    expect(
      screen.queryByTestId('composer-reconnected-status'),
    ).not.toBeInTheDocument();
  });

  it('re-enables sending after reconnect so a retry can go through', () => {
    const { onSend } = renderOfflineThenOnline();

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does not show the reconnect confirmation on the initial online render', () => {
    render(
      <MessageComposer
        value="hello"
        onChange={jest.fn()}
        onSend={jest.fn()}
        placeholder="Send encrypted message..."
        label="Send encrypted message"
        isOffline={false}
      />,
    );

    expect(
      screen.queryByTestId('composer-reconnected-status'),
    ).not.toBeInTheDocument();
  });
});
