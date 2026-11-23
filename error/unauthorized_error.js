/**
 * Raised when the caller's identity headers are missing. Maps to 401.
 *
 * @author: tgibbons via Claude
 */
export default class UnauthorizedError extends Error {
    /**
     * Creates the error with a summary message and the list of missing headers.
     */
    constructor(message, details = []) {
        super(message);
        this.name = 'UnauthorizedError';
        this.status = 401;
        this.details = details;
    }
}
