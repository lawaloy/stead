export const repeatJourneys = async (count, operation, signal) => {
  const attempts = [];
  for (let index = 0; index < count; index += 1) {
    if (signal?.aborted) break;
    try {
      attempts.push({
        attempt: index + 1,
        status: 'passed',
        ...(await operation(index + 1)),
      });
    } catch (error) {
      attempts.push({
        attempt: index + 1,
        status: 'failed',
        error: error.message,
      });
    }
  }
  return attempts;
};
