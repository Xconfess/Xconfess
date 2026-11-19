/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ConfirmDialog } from '../ConfirmDialog';

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const onOpenChange = jest.fn();

  const utils = render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete confession?"
      description="Permanently delete the reported confession."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { ...utils, onConfirm, onCancel, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('renders the title, description and action labels', () => {
    renderDialog();

    expect(screen.getByText('Delete confession?')).toBeInTheDocument();
    expect(
      screen.getByText('Permanently delete the reported confession.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('lists the consequences of the action so they can be reviewed before confirming', () => {
    renderDialog({
      consequences: [
        'The confession and its comments are permanently removed for everyone.',
        'This cannot be undone.',
      ],
    });

    const list = screen.getByTestId('confirm-dialog-consequences');
    expect(list).toBeInTheDocument();
    expect(
      screen.getByText(
        'The confession and its comments are permanently removed for everyone.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('does not render the consequences list when there are no consequences', () => {
    renderDialog();

    expect(
      screen.queryByTestId('confirm-dialog-consequences'),
    ).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog — confirming', () => {
  it('runs the action when the confirm button is clicked', () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('confirms when Enter is pressed inside the dialog', () => {
    const { onConfirm } = renderDialog();

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not confirm when Enter is pressed on a focused button', () => {
    const { onConfirm } = renderDialog();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.keyDown(cancelButton, { key: 'Enter' });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not confirm on any other key', () => {
    const { onConfirm } = renderDialog();

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'a' });
    fireEvent.keyDown(dialog, { key: ' ' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog — dismissing', () => {
  it('cancels without running the action when the cancel button is clicked', () => {
    const { onConfirm, onCancel, onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancels without running the action when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel, onOpenChange } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancels without running the action when the close button is clicked', () => {
    const { onConfirm, onCancel, onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmDialog — in-flight state', () => {
  it('disables both actions and shows the processing label while the action runs', () => {
    renderDialog({ loading: true });

    const confirmButton = screen.getByRole('button', { name: /processing/i });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('does not confirm or cancel while the action is running', () => {
    const { onConfirm, onCancel } = renderDialog({ loading: true });

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /processing/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
