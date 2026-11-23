/**
 * A note: written by one user (authorId) within one team (teamId).
 *
 * @author: tgibbons via Claude
 */
export default class Note {
    /**
     * Creates a note from its fields. body is optional and defaults to null.
     */
    constructor({ id, title, body = null, visibility, teamId, authorId, createdAt, updatedAt }) {
        this.id = id;
        this.title = title;
        this.body = body;
        this.visibility = visibility;
        this.teamId = teamId;
        this.authorId = authorId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
