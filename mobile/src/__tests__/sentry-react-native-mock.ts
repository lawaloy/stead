export const init = jest.fn();
export const captureException = jest.fn(() => 'event-id');
export const wrap = jest.fn(<T>(component: T): T => component);
