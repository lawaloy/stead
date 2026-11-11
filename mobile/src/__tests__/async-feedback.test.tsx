import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LoadingFeedback, RetryFeedback } from '../components/async-feedback';

describe('async feedback', () => {
  it('exposes loading copy as a polite progressbar', async () => {
    await render(<LoadingFeedback message="Loading account..." />);

    expect(
      screen.getByRole('progressbar', { name: 'Loading account...' }),
    ).toBeOnTheScreen();
  });

  it('invokes retry when idle', async () => {
    const onRetry = jest.fn();
    await render(
      <RetryFeedback message="Could not load account." onRetry={onRetry} />,
    );

    expect(
      screen.getByRole('alert', { name: 'Could not load account.' }),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry while a refetch is in flight', async () => {
    const onRetry = jest.fn();
    await render(
      <RetryFeedback
        message="Could not load account."
        onRetry={onRetry}
        retrying
      />,
    );

    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
