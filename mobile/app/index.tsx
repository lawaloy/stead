import { Redirect } from 'expo-router';

// `/` is only a URL entry point. The root layout keeps this route out of the
// stack (Stack.Protected guard={false}) so it is never mounted on native; the
// stack starts on the first screen the auth guards allow. This redirect is a
// fallback for platforms or tools that render the route directly.
export default function Index() {
  return <Redirect href="/(auth)/request-otp" />;
}
