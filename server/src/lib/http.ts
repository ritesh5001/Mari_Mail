import type { Response } from "express";

export function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

export function sendData<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}
