/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { InlineError } from '../InlineError';

describe('InlineError', () => {
  it('renders nothing when message is undefined', () => {
    const { container } = render(<InlineError message={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is null', () => {
    const { container } = render(<InlineError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is an empty string', () => {
    const { container } = render(<InlineError message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the message text when provided', () => {
    render(<InlineError message="Something went wrong." />);
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('has role="alert" for accessible announcement', () => {
    render(<InlineError message="Error occurred" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has aria-live="assertive" so screen readers announce immediately', () => {
    render(<InlineError message="Error occurred" />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('sets the id attribute when provided', () => {
    render(<InlineError message="Bad email" id="email-error" />);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'email-error');
  });

  it('applies extra className for layout overrides', () => {
    render(<InlineError message="Error" className="mt-5" />);
    expect(screen.getByRole('alert')).toHaveClass('mt-5');
  });

  it('always includes the base error styling classes', () => {
    render(<InlineError message="Error" />);
    const el = screen.getByRole('alert');
    expect(el).toHaveClass('rounded-xl');
    expect(el).toHaveClass('text-[var(--danger)]');
  });
});
