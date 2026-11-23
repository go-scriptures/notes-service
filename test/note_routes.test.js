/**
 * HTTP tests for the notes service: every endpoint, the visibility and ownership rules,
 * and the error paths. Uses Node's built-in test runner and fetch.
 *
 * @author: tgibbons via Claude
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Tell app.js not to listen on its own; it is imported dynamically so this runs first.
process.argv.push('--test');
const { default: app, errorHandler } = await import('../app.js');

let server;
let baseUrl;

// Users: ann and bob are in team red; cat is in team blue.
const ANN = { team: 'red', user: 'ann' };
const BOB = { team: 'red', user: 'bob' };
const CAT = { team: 'blue', user: 'cat' };

before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://localhost:${server.address().port}`;
});

after(() => {
    server.closeAllConnections();
    server.close();
});

/**
 * Sends a request as the given caller (or with no identity headers when caller is null)
 * and returns the status, headers and parsed JSON body.
 */
async function request(method, path, { as = ANN, body, rawBody, headers = {} } = {}) {
    const allHeaders = { ...headers };
    if (as) {
        allHeaders['X-Team-Id'] = as.team;
        allHeaders['X-User-Id'] = as.user;
    }
    if (body !== undefined || rawBody !== undefined) {
        allHeaders['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: allHeaders,
        body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

/**
 * Creates a note as the given caller and returns it.
 */
async function givenNote(as, fields) {
    const response = await request('POST', '/notes', { as, body: fields });
    assert.equal(response.status, 201);
    return response.body;
}

// Identity headers
describe('Identity', () => {
    // No identity headers: 401 listing both missing headers.
    test('missing both headers returns 401', async () => {
        const response = await request('GET', '/notes', { as: null });
        assert.equal(response.status, 401);
        assert.equal(response.body.details.length, 2);
    });

    // Only the team header: 401 naming the user header.
    test('missing X-User-Id returns 401', async () => {
        const response = await request('GET', '/notes', { as: null, headers: { 'X-Team-Id': 'red' } });
        assert.equal(response.status, 401);
        assert.deepEqual(response.body.details, ['X-User-Id header is required']);
    });
});

// POST /notes
describe('Create', () => {
    // A note with only a title gets the defaults: body null, visibility MINE.
    test('creates a note with defaults and a Location header', async () => {
        const response = await request('POST', '/notes', { body: { title: 'First' } });
        assert.equal(response.status, 201);
        assert.equal(response.headers.get('location'), `/notes/${response.body.id}`);
        assert.equal(response.body.title, 'First');
        assert.equal(response.body.body, null);
        assert.equal(response.body.visibility, 'MINE');
        assert.equal(response.body.teamId, 'red');
        assert.equal(response.body.authorId, 'ann');
        assert.ok(response.body.createdAt);
        assert.equal(response.body.createdAt, response.body.updatedAt);
    });

    // Every field given is stored; unknown fields and caller-supplied IDs are ignored.
    test('stores body and visibility and ignores other fields', async () => {
        const response = await request('POST', '/notes', {
            body: { title: 'T', body: 'text', visibility: 'TEAM', authorId: 'someone', extra: 1 }
        });
        assert.equal(response.status, 201);
        assert.equal(response.body.body, 'text');
        assert.equal(response.body.visibility, 'TEAM');
        assert.equal(response.body.authorId, 'ann');
        assert.equal(response.body.extra, undefined);
    });

    // A missing title and a bad visibility are both reported.
    test('returns 400 listing every problem', async () => {
        const response = await request('POST', '/notes', { body: { visibility: 'PUBLIC' } });
        assert.equal(response.status, 400);
        assert.equal(response.body.details.length, 2);
    });

    // A blank title is not a title.
    test('rejects a blank title', async () => {
        const response = await request('POST', '/notes', { body: { title: '   ' } });
        assert.equal(response.status, 400);
    });

    // No body at all is a 400, not a 500.
    test('rejects a request with no body', async () => {
        const response = await request('POST', '/notes');
        assert.equal(response.status, 400);
    });

    // A body that is not JSON is a 400 in JSON.
    test('rejects a body that is not valid JSON', async () => {
        const response = await request('POST', '/notes', { rawBody: '{bad' });
        assert.equal(response.status, 400);
        assert.ok(response.body.error);
    });
});

// GET /notes/{id}
describe('Read one', () => {
    // The author can read their own MINE note.
    test('the author reads their own note', async () => {
        const note = await givenNote(ANN, { title: 'Mine' });
        const response = await request('GET', `/notes/${note.id}`);
        assert.equal(response.status, 200);
        assert.equal(response.body.id, note.id);
    });

    // A teammate can read a TEAM note.
    test('a teammate reads a TEAM note', async () => {
        const note = await givenNote(ANN, { title: 'Shared', visibility: 'TEAM' });
        const response = await request('GET', `/notes/${note.id}`, { as: BOB });
        assert.equal(response.status, 200);
    });

    // A teammate cannot see a MINE note: 404, so it is not revealed.
    test('a teammate gets 404 for a MINE note', async () => {
        const note = await givenNote(ANN, { title: 'Private' });
        const response = await request('GET', `/notes/${note.id}`, { as: BOB });
        assert.equal(response.status, 404);
    });

    // Another team never sees the note, even a TEAM one.
    test('another team gets 404 for a TEAM note', async () => {
        const note = await givenNote(ANN, { title: 'Shared', visibility: 'TEAM' });
        const response = await request('GET', `/notes/${note.id}`, { as: CAT });
        assert.equal(response.status, 404);
    });

    // An ID that does not exist.
    test('an unknown id returns 404', async () => {
        const response = await request('GET', '/notes/no-such-id');
        assert.equal(response.status, 404);
    });
});

// GET /notes
describe('List', () => {
    // Fresh users in a fresh team, so other tests' notes do not interfere.
    const DAN = { team: 'green', user: 'dan' };
    const EVE = { team: 'green', user: 'eve' };
    let danMine, danTeam, eveMine, eveTeam;

    before(async () => {
        danMine = await givenNote(DAN, { title: 'dan mine' });
        danTeam = await givenNote(DAN, { title: 'dan team', visibility: 'TEAM' });
        eveMine = await givenNote(EVE, { title: 'eve mine' });
        eveTeam = await givenNote(EVE, { title: 'eve team', visibility: 'TEAM' });
        await givenNote(CAT, { title: 'cat team', visibility: 'TEAM' });
    });

    /**
     * Returns the sorted IDs of a list response.
     */
    function ids(response) {
        return response.body.map(note => note.id).sort();
    }

    // Default scope is team: all my notes plus teammates' TEAM notes.
    test('defaults to scope=team', async () => {
        const response = await request('GET', '/notes', { as: DAN });
        assert.equal(response.status, 200);
        assert.deepEqual(ids(response), [danMine.id, danTeam.id, eveTeam.id].sort());
    });

    // scope=mine: only my own notes.
    test('scope=mine returns only my notes', async () => {
        const response = await request('GET', '/notes?scope=mine', { as: DAN });
        assert.deepEqual(ids(response), [danMine.id, danTeam.id].sort());
    });

    // author narrows scope=team to one author's visible notes.
    test('author filters scope=team', async () => {
        const response = await request('GET', '/notes?author=eve', { as: DAN });
        assert.deepEqual(ids(response), [eveTeam.id]);
    });

    // author is ignored when scope=mine.
    test('author is ignored with scope=mine', async () => {
        const response = await request('GET', '/notes?scope=mine&author=eve', { as: DAN });
        assert.deepEqual(ids(response), [danMine.id, danTeam.id].sort());
    });

    // Eve sees her own MINE note, never Dan's.
    test('a teammate sees their own MINE notes but not mine', async () => {
        const response = await request('GET', '/notes', { as: EVE });
        assert.deepEqual(ids(response), [danTeam.id, eveMine.id, eveTeam.id].sort());
    });

    // An unknown scope is a 400.
    test('an invalid scope returns 400', async () => {
        const response = await request('GET', '/notes?scope=everyone', { as: DAN });
        assert.equal(response.status, 400);
    });
});

// PATCH /notes/{id}
describe('Update', () => {
    // The author changes title, body and visibility; updatedAt moves on.
    test('the author updates their note', async () => {
        const note = await givenNote(ANN, { title: 'Old' });
        await new Promise(resolve => setTimeout(resolve, 5));
        const response = await request('PATCH', `/notes/${note.id}`, {
            body: { title: 'New', body: 'b', visibility: 'TEAM' }
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.title, 'New');
        assert.equal(response.body.body, 'b');
        assert.equal(response.body.visibility, 'TEAM');
        assert.equal(response.body.createdAt, note.createdAt);
        assert.notEqual(response.body.updatedAt, note.updatedAt);
    });

    // A teammate can see a TEAM note but cannot change it: 403.
    test('a teammate gets 403 on a TEAM note', async () => {
        const note = await givenNote(ANN, { title: 'Shared', visibility: 'TEAM' });
        const response = await request('PATCH', `/notes/${note.id}`, { as: BOB, body: { title: 'Hijack' } });
        assert.equal(response.status, 403);
    });

    // A teammate cannot see a MINE note: 404.
    test('a teammate gets 404 on a MINE note', async () => {
        const note = await givenNote(ANN, { title: 'Private' });
        const response = await request('PATCH', `/notes/${note.id}`, { as: BOB, body: { title: 'x' } });
        assert.equal(response.status, 404);
    });

    // Nothing to change is a 400.
    test('an empty update returns 400', async () => {
        const note = await givenNote(ANN, { title: 'T' });
        const response = await request('PATCH', `/notes/${note.id}`, { body: {} });
        assert.equal(response.status, 400);
    });

    // Fields other than title, body and visibility cannot be changed.
    test('ignores fields other than title, body and visibility', async () => {
        const note = await givenNote(ANN, { title: 'T' });
        const response = await request('PATCH', `/notes/${note.id}`, { body: { title: 'U', authorId: 'bob' } });
        assert.equal(response.status, 200);
        assert.equal(response.body.authorId, 'ann');
    });
});

// DELETE /notes/{id}
describe('Delete', () => {
    // The author deletes; the note is then gone.
    test('the author deletes their note', async () => {
        const note = await givenNote(ANN, { title: 'Bye' });
        const response = await request('DELETE', `/notes/${note.id}`);
        assert.equal(response.status, 204);
        assert.equal((await request('GET', `/notes/${note.id}`)).status, 404);
    });

    // A teammate cannot delete a TEAM note: 403, and the note survives.
    test('a teammate gets 403 and the note survives', async () => {
        const note = await givenNote(ANN, { title: 'Keep', visibility: 'TEAM' });
        const response = await request('DELETE', `/notes/${note.id}`, { as: BOB });
        assert.equal(response.status, 403);
        assert.equal((await request('GET', `/notes/${note.id}`)).status, 200);
    });

    // Another team cannot even find it: 404.
    test('another team gets 404', async () => {
        const note = await givenNote(ANN, { title: 'Keep' });
        const response = await request('DELETE', `/notes/${note.id}`, { as: CAT });
        assert.equal(response.status, 404);
    });
});

// Routes and headers outside the notes endpoints
describe('General', () => {
    // An unknown route is a JSON 404.
    test('an unknown route returns a JSON 404', async () => {
        const response = await request('GET', '/nothing-here');
        assert.equal(response.status, 404);
        assert.ok(response.body.error);
    });

    // The framework is not advertised.
    test('responses have no X-Powered-By header', async () => {
        const response = await request('GET', '/notes');
        assert.equal(response.headers.get('x-powered-by'), null);
    });

    // An unexpected error is a 500 without its details.
    test('the error handler hides 500 details', (t) => {
        t.mock.method(console, 'error', () => {});
        let sent;
        const res = { status(code) { sent = { code }; return this; }, json(body) { sent.body = body; } };
        errorHandler(new Error('secret detail'), {}, res, () => {});
        assert.equal(sent.code, 500);
        assert.deepEqual(sent.body, { error: 'internal server error' });
    });
});
