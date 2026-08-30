import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const ScreenShell = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.body}>{children}</View>
    </ScrollView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f8fb' },
  wrap: { padding: 18, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f1c2f' },
  body: { gap: 12 },
});
