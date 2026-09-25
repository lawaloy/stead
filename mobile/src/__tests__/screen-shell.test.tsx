import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ScreenShell } from '../components/screen-shell';

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('View', null, children),
  };
});

describe('ScreenShell', () => {
  it('lets form controls handle a tap while the keyboard is open', async () => {
    const view = await render(
      <ScreenShell title="Example">
        <Text>Content</Text>
      </ScreenShell>,
    );

    expect(
      view.getByTestId('screen-shell-scroll').props.keyboardShouldPersistTaps,
    ).toBe('handled');
    expect(
      view.getByTestId('screen-shell-scroll').props.keyboardDismissMode,
    ).toBe('on-drag');
  });

  it('can skip the outer scroll shell for screens with their own refresh', async () => {
    const view = await render(
      <ScreenShell title="Example" scroll={false}>
        <Text>Content</Text>
      </ScreenShell>,
    );

    expect(view.getByTestId('screen-shell-static')).toBeTruthy();
    expect(view.queryByTestId('screen-shell-scroll')).toBeNull();
  });
});
