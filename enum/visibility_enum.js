/**
 * Who can see a note: MINE (only its author) or TEAM (everyone in the author's team).
 *
 * @author: tgibbons via Claude
 */
export const Visibility = Object.freeze({
    MINE: 'MINE',
    TEAM: 'TEAM'
});

/**
 * Returns true when the value is one of the Visibility values (case-sensitive).
 */
export function isValidVisibility(value) {
    return Object.values(Visibility).includes(value);
}
