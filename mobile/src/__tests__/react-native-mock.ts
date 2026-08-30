import React from 'react';

type HostProps = Record<string, unknown> & { children?: React.ReactNode };

const host = (name: string) => {
  const HostComponent = React.forwardRef<unknown, HostProps>(
    ({ children, ...props }, ref) =>
    React.createElement(name, { ...props, ref }, children as React.ReactNode),
  );
  HostComponent.displayName = `Mock${name}`;
  return HostComponent;
};

export const View = host('View');
export const Text = host('Text');
export const TextInput = host('TextInput');
export const ScrollView = host('ScrollView');
export const Pressable = React.forwardRef<unknown, HostProps>(
  ({ children, ...props }, ref) =>
    React.createElement(
      'View',
      { accessible: true, ...props, ref },
      children as React.ReactNode,
    ),
);
Pressable.displayName = 'MockPressable';
export const ActivityIndicator = host('View');

const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style && typeof style === 'object'
    ? (style as Record<string, unknown>)
    : {};
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: flattenStyle,
};

export const Alert = {
  alert: jest.fn(),
};
