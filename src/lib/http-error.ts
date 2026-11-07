export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: readonly { path: string; message: string }[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}
