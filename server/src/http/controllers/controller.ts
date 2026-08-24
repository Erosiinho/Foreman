import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Wraps an async route handler so a rejected promise reaches Express's error middleware instead of hanging the request. */
export default function asyncController(handler: AsyncHandler): RequestHandler {
    return (req, res, next) => {
        handler(req, res, next).catch(next);
    };
}
