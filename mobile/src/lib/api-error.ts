export type ApiErrorShape = {
  message: string;
  status?: number;
  details?: unknown;
};

export class ApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(input: ApiErrorShape) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.details = input.details;
  }
}
