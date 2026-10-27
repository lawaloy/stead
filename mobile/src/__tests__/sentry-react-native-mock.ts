export const init = jest.fn();
export const captureException = jest.fn(() => 'event-id');
export const wrap = <T>(component: T): T => component;
