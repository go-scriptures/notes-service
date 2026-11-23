/**
 * Data access for notes. Storage only: no business rules.
 *
 * Notes are held in memory and are lost when the process stops. Every method is async,
 * so a database can replace the Map without changing the callers.
 * Copies are returned, so a caller cannot change a stored note by accident.
 *
 * @author: tgibbons via Claude
 */
import { randomUUID } from 'node:crypto';
import Note from '../model/note_model.js';

const notes = new Map();

/**
 * Returns a copy of a stored note, or null.
 */
function copyOf(note) {
    return note ? new Note({ ...note }) : null;
}

/**
 * Stores a new note with a new UUID and the created/updated dates, and returns it.
 */
export async function createNote(fields) {
    const now = new Date().toISOString();
    const note = new Note({ ...fields, id: randomUUID(), createdAt: now, updatedAt: now });
    notes.set(note.id, note);
    return copyOf(note);
}

/**
 * Returns the note with this id, or null when there is none.
 */
export async function getNote(id) {
    return copyOf(notes.get(id));
}

/**
 * Returns every note in the team, oldest first.
 */
export async function listNotesByTeam(teamId) {
    return [...notes.values()].filter(note => note.teamId === teamId).map(copyOf);
}

/**
 * Applies the changed fields to a stored note, sets updatedAt, and returns it (null when there is none).
 */
export async function updateNote(id, changes) {
    const note = notes.get(id);
    if (!note) {
        return null;
    }
    Object.assign(note, changes, { updatedAt: new Date().toISOString() });
    return copyOf(note);
}

/**
 * Removes the note permanently. Returns true when a note was removed.
 */
export async function deleteNote(id) {
    return notes.delete(id);
}
