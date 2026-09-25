import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const ScreenShell = ({
  title,
  children,
  scroll = true,
}: {
  title: string;
  children: React.ReactNode;
  /** When false, the shell does not wrap children in a ScrollView (e.g. screens with their own RefreshControl). */
  scroll?: boolean;
}) => (
  <SafeAreaView style={styles.safe}>
    {scroll ? (
      <ScrollView
        testID="screen-shell-scroll"
        contentContainerStyle={styles.wrap}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    ) : (
      <View testID="screen-shell-static" style={styles.wrap}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={[styles.body, styles.bodyFlex]}>{children}</View>
      </View>
    )}
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fb' },
  wrap: { flex: 1, padding: 18, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f1c2f' },
  body: { gap: 12 },
  bodyFlex: { flex: 1 },
});
