import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const LoadingFeedback = ({ message }: { message: string }) => (
  <Text accessibilityLiveRegion="polite" accessibilityRole="progressbar">
    {message}
  </Text>
);

export const RetryFeedback = ({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => unknown;
  retrying?: boolean;
}) => (
  <View style={styles.container}>
    <Text
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={styles.error}
    >
      {message}
    </Text>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: retrying }}
      disabled={retrying}
      onPress={() => onRetry()}
    >
      <Text style={styles.action}>{retrying ? 'Retrying...' : 'Retry'}</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  container: { gap: 8 },
  error: { color: '#c02020' },
  action: { color: '#1769aa', fontWeight: '700' },
});
