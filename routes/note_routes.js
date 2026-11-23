/**
 * HTTP routes for notes. HTTP only: reads the request, calls the manager, sends the status.
 *
 * @author: tgibbons via Claude
 */
import { Router } from 'express';
import * as noteManager from '../manager/note_manager.js';
import UnauthorizedError from '../error/unauthorized_error.js';

const router = Router();

// Every notes request must identify its caller. The headers are trusted:
// in production a login service or API gateway would verify the user and set them.
router.use((req, res, next) => {
    const teamId = req.get('X-Team-Id');
    const userId = req.get('X-User-Id');
    const missing = [];
    if (!teamId) {
        missing.push('X-Team-Id header is required');
    }
    if (!userId) {
        missing.push('X-User-Id header is required');
    }
    if (missing.length > 0) {
        throw new UnauthorizedError('Caller identity is required', missing);
    }
    req.identity = { teamId, userId };
    next();
});

// Create a note: 201 with a Location header.
router.post('/', async (req, res) => {
    const note = await noteManager.createNote(req.identity, req.body);
    res.status(201).location(`${req.baseUrl}/${note.id}`).json(note);
});

// List notes, filtered by scope and author.
router.get('/', async (req, res) => {
    res.json(await noteManager.listNotes(req.identity, req.query));
});

// Read one note.
router.get('/:id', async (req, res) => {
    res.json(await noteManager.getNote(req.identity, req.params.id));
});

// Update a note's title, body or visibility.
router.patch('/:id', async (req, res) => {
    res.json(await noteManager.updateNote(req.identity, req.params.id, req.body));
});

// Delete a note: 204 with no body.
router.delete('/:id', async (req, res) => {
    await noteManager.deleteNote(req.identity, req.params.id);
    res.status(204).end();
});

export default router;
