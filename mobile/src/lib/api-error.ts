export type ApiErrorShape = {
  message: string;
  status?: number;
  details?: unknown;
  requestId?: string;
};

export class ApiError extends Error {
  status?: number;
  details?: unknown;
  requestId?: string;

  constructor(input: ApiErrorShape) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.details = input.details;
    this.requestId = input.requestId;
  }
}
