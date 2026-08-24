import { ErrorRequestHandler } from 'express';
import { HttpError } from '../errors';

/** Registered AFTER routes in server.ts — an error middleware registered before its routes never sees their errors. */
const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
    }
    console.error('[http] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
};

export default errorMiddleware;
