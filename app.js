/**
 * Entry point for the notes service.
 *
 * Builds the Express app and starts listening, unless it is given the --test parameter.
 * Tests add --test before importing this file, so they can start the app on their own port.
 *
 * @author: tgibbons via Claude
 */
import express from 'express';
import notes from './routes/note_routes.js';
import NotFoundError from './error/not_found_error.js';

const MINIMUM_NODE_MAJOR = 20;
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < MINIMUM_NODE_MAJOR) {
    console.error(`Node ${MINIMUM_NODE_MAJOR} or later is required; you are running ${process.versions.node}.`);
    process.exit(1);
}

const port = process.env.PORT ?? 3000;
const app = express();

// Express adds an "X-Powered-By: Express" header that advertises the framework, so it is turned off.
app.disable('x-powered-by');
app.use(express.json());
app.use('/notes', notes);

// Any route not handled above returns a JSON 404.
app.use((req, res, next) => {
    throw new NotFoundError(`Route ${req.method} ${req.path} not found`);
});

/**
 * Central error handler: turns typed errors into JSON { error, details }.
 * Anything without a status is a 500, logged in full but reported without details.
 */
export function errorHandler(err, req, res, next) {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) {
        console.error(err);
        return res.status(status).json({ error: 'internal server error' });
    }
    const body = { error: err.message };
    if (err.details) {
        body.details = err.details;
    }
    res.status(status).json(body);
}

app.use(errorHandler);

export default app;

if (!process.argv.includes('--test')) {
    app.listen(port, () => {
        console.log(`Notes service listening on port ${port}`);
    });
}
