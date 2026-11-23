/**
 * Business rules for notes: validation, visibility and ownership.
 * Throws typed errors and knows nothing about HTTP.
 *
 * Every function takes the caller's identity: { teamId, userId }.
 *
 * @author: tgibbons via Claude
 */
import * as noteApi from '../api/note_api.js';
import { Visibility, isValidVisibility } from '../enum/visibility_enum.js';
import { Scope, isValidScope } from '../enum/scope_enum.js';
import ValidationError from '../error/validation_error.js';
import ForbiddenError from '../error/forbidden_error.js';
import NotFoundError from '../error/not_found_error.js';

const VISIBILITY_RULE = 'visibility must be one of MINE, TEAM';

/**
 * Returns true when the value is a string with at least one non-space character.
 */
function isNonBlankString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns true when the caller may see the note: it is in the caller's team, and
 * either the caller wrote it or its visibility is TEAM.
 */
function canSee(note, identity) {
    return note.teamId === identity.teamId
        && (note.authorId === identity.userId || note.visibility === Visibility.TEAM);
}

/**
 * Returns the note when the caller may see it. Otherwise throws NotFoundError,
 * so a note the caller cannot see is indistinguishable from one that does not exist.
 */
async function findVisibleNote(id, identity) {
    const note = await noteApi.getNote(id);
    if (!note || !canSee(note, identity)) {
        throw new NotFoundError(`Note ${id} not found`);
    }
    return note;
}

/**
 * Returns the note when the caller wrote it. A note the caller can see but did not write
 * throws ForbiddenError; a note the caller cannot see throws NotFoundError.
 */
async function findOwnNote(id, identity) {
    const note = await findVisibleNote(id, identity);
    if (note.authorId !== identity.userId) {
        throw new ForbiddenError('Only the author can change or delete a note');
    }
    return note;
}

/**
 * Creates a note for the caller. title is required; body is optional;
 * visibility defaults to MINE. Unknown fields are ignored.
 */
export async function createNote(identity, input = {}) {
    const details = [];
    if (!isNonBlankString(input.title)) {
        details.push('title is required and must be a non-blank string');
    }
    if (input.body !== undefined && input.body !== null && typeof input.body !== 'string') {
        details.push('body must be a string');
    }
    if (input.visibility !== undefined && !isValidVisibility(input.visibility)) {
        details.push(VISIBILITY_RULE);
    }
    if (details.length > 0) {
        throw new ValidationError('Invalid note', details);
    }

    return noteApi.createNote({
        title: input.title,
        body: input.body ?? null,
        visibility: input.visibility ?? Visibility.MINE,
        teamId: identity.teamId,
        authorId: identity.userId
    });
}

/**
 * Returns one note the caller may see.
 */
export async function getNote(identity, id) {
    return findVisibleNote(id, identity);
}

/**
 * Lists notes in the caller's team.
 * scope=team (the default): the caller's own notes plus the other members' TEAM notes.
 * scope=mine: only the caller's own notes; author is ignored.
 * author: narrows the list to one author; when missing, all authors in scope are returned.
 */
export async function listNotes(identity, query = {}) {
    const details = [];
    const scope = query.scope ?? Scope.TEAM;
    if (Array.isArray(scope) || !isValidScope(scope)) {
        details.push('scope must be one of mine, team');
    }
    if (Array.isArray(query.author)) {
        details.push('author may be given only once');
    }
    if (details.length > 0) {
        throw new ValidationError('Invalid list query', details);
    }

    const teamNotes = await noteApi.listNotesByTeam(identity.teamId);
    if (scope === Scope.MINE) {
        return teamNotes.filter(note => note.authorId === identity.userId);
    }
    return teamNotes
        .filter(note => canSee(note, identity))
        .filter(note => query.author === undefined || note.authorId === query.author);
}

/**
 * Updates the title, body or visibility of a note the caller wrote.
 * At least one of the three must be given. Other fields are ignored.
 */
export async function updateNote(identity, id, input = {}) {
    const details = [];
    const changes = {};
    if (input.title !== undefined) {
        if (isNonBlankString(input.title)) {
            changes.title = input.title;
        } else {
            details.push('title must be a non-blank string');
        }
    }
    if (input.body !== undefined) {
        if (input.body === null || typeof input.body === 'string') {
            changes.body = input.body;
        } else {
            details.push('body must be a string or null');
        }
    }
    if (input.visibility !== undefined) {
        if (isValidVisibility(input.visibility)) {
            changes.visibility = input.visibility;
        } else {
            details.push(VISIBILITY_RULE);
        }
    }
    if (details.length === 0 && Object.keys(changes).length === 0) {
        details.push('at least one of title, body, visibility is required');
    }
    if (details.length > 0) {
        throw new ValidationError('Invalid note update', details);
    }

    await findOwnNote(id, identity);
    return noteApi.updateNote(id, changes);
}

/**
 * Deletes a note the caller wrote. The delete is permanent.
 */
export async function deleteNote(identity, id) {
    await findOwnNote(id, identity);
    await noteApi.deleteNote(id);
}
