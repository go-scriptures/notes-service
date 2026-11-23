/**
 * Which notes a list request covers: mine (only the caller's own notes) or
 * team (the caller's own notes plus the other team members' TEAM notes).
 *
 * @author: tgibbons via Claude
 */
export const Scope = Object.freeze({
    MINE: 'mine',
    TEAM: 'team'
});

/**
 * Returns true when the value is one of the Scope values (case-sensitive).
 */
export function isValidScope(value) {
    return Object.values(Scope).includes(value);
}
