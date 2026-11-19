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
