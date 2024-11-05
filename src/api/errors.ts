export class InvalidRequestError extends Error {
  status: number;
  constructor(msg: string, status: number = 400) {
    super(msg);
    this.name = this.constructor.name;
    this.status = status;
  }
}
