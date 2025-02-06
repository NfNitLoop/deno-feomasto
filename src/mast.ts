// deno-lint-ignore-file


/** A client for querying Mastodon */
export class Client {
    #baseURL: string
    #authHeaders: Record<string, string> 

    readonly #context: StatusContext["context"]

    constructor({baseURL, token}: ClientOptions) {
        this.#baseURL = baseURL.replace(/\/+$/, "")
        this.#authHeaders = {
            "Authorization": `Bearer ${token}`
        }
        this.#context = {
            baseURL: this.#baseURL
        }
    }

    /** Assert credentials are correct. Else: throws. */
    async verifyCredentials() {
        const _result = await this.checkedGET("/api/v1/apps/verify_credentials")
        return true
    }

    // Get one page of the home timeline, starting at maxID and continuing in reverse chronological order.
    private async homeTimelinePage(maxID: string|undefined): Promise<Status[]> {
        let url = "/api/v1/timelines/home"
        if (maxID) { url += `?max_id=${maxID}` }

        const result = await this.checkedGET(url)
        const json = await result.json()
        return json as Status[]
    }

    /** Automatically paginate through the user's home timeline */
    async * homeTimeline(): AsyncGenerator<StatusContext> {
        let maxID: string|undefined = undefined;

        while (true) {
            const statuses: Status[] = await this.homeTimelinePage(maxID)
            if (statuses.length == 0) { return }
            for (const status of statuses) {
                yield { status, context: this.#context }
            }
            maxID = statuses[statuses.length-1].id
        }
    }

    // Get a single status by ID.
    async getStatus(id: string): Promise<StatusContext> {
        let status = await this.#getJSON<Status>(`/api/v1/statuses/${id}`)
        return {status, context: this.#context}
    }

    async #getJSON<T>(relPath: string): Promise<T> {
        let res = await this.checkedGET(relPath)
        let json = await res.json()
        return json as T
    }

    private async checkedGET(relativeURL: string): Promise<Response> {
        const result = await fetch(new Request(
            `${this.#baseURL}${relativeURL}`,
            {
                headers: this.#authHeaders
            }
        ))

        if (!result.ok) {
            // TODO: Special case(s) for slowMode. 
            // TODO: Special case for invalid access token?
            throw {
                context: `Error fetching from ${relativeURL}`,
                result: result
            }
        }

        return result
    }
}

interface ClientOptions {
    baseURL: string
    token: string

    /** 
     * Enable slow mode, which will wait as long as necessary for our API rate limit.
     * (Default: fail fast when we hit our API rate limit.)
     */
    // slowMode?: boolean
}


/** 
 * A subset of https://docs.joinmastodon.org/entities/status/ 
 */
export interface Status {
    /** Really should just be used for pagination with max_id */
    id: string

    /**
     * ex: "2019-12-08T03:48:33.901Z"
     */
    created_at: string
    account: Account

    /**
     * A link to the status's HTML representation.
     * 
     * ... Well, so say the docs at https://docs.joinmastodon.org/entities/Status/#url
     * However, when a status is a reblog, you get a URL in the format:
     * https://mastodon.social/users/{username}/statuses/{statusID}/activity
     * // Which is NOT an HTML representation. 
     */
    url?: string

    /**
     * A link to the status's URI, used for federation:
     */
    uri: string

    content: string

    reblog?: Status

    visibility: "public"|"unlisted"|"private"|"direct"
    spoiler_text?: string
    media_attachments: Attachment[]

    // TODO: Support custom emoji?
    // emojis: Emoji[]
}

export interface StatusContext {
    status: Status,

    /** Additional context about the Status, not included in its JSON */
    readonly context: {
        // Necessary for constructing instance-local links.
        baseURL: string
    }
}

export interface Account {
    /**
     * ex: "foo@example.social" for remote users, or just "foo" for local users.
     */
    acct: string

    display_name?: string

    /**
     * URL to view a user's page. (May be private)
     */
    url: string
}

export interface Attachment {
    url: string,
    preview_url?: string
    remote_url?: string
    description?: string
    type: "image"|"video"|"audio"|string
}