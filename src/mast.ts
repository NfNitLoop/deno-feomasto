import * as z from "zod"

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
        const _result = await this.#checkedGET("/api/v1/apps/verify_credentials")
        return true
    }

    // Get one page of the home timeline, starting at maxID and continuing in reverse chronological order.
    private async homeTimelinePage(maxID: string|undefined): Promise<Status[]> {
        let url = "/api/v1/timelines/home"
        if (maxID) { url += `?max_id=${maxID}` }

        const result = await this.#checkedGET(url)
        const json = await result.json()
        try {
            return Status.array().parse(json)
        } catch (e) {
            console.log("ERROR PARSING:")
            console.log(json)
            throw e
        }
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
        const status = await this.#getJSON<Status>(`/api/v1/statuses/${id}`)
        return {status, context: this.#context}
    }

    async #getJSON<T>(relPath: string): Promise<T> {
        const res = await this.#checkedGET(relPath)
        const json = await res.json()
        return json as T
    }

    async #checkedGET(relativeURL: string): Promise<Response> {
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
                result: await result.text()
            }
        }

        return result
    }
}

type ClientOptions = {
    baseURL: string
    token: string

    /** 
     * Enable slow mode, which will wait as long as necessary for our API rate limit.
     * (Default: fail fast when we hit our API rate limit.)
     */
    // slowMode?: boolean
}


export type Account = z.infer<typeof Account>
const Account = z.object({
    /**
     * ex: "foo@example.social" for remote users, or just "foo" for local users.
     */
    acct: z.string(),

    display_name: z.string().optional(),

    /**
     * URL to view a user's page. (May be private)
     */
    url: z.string().url()
}).passthrough()


type Attachment = z.infer<typeof Attachment>
const Attachment = z.object({
    url: z.string().url(),
    preview_url: z.string().url().optional(),
    remote_url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),

    /** image/video/audio, other? */
    type: z.string()
}).passthrough()


/** 
 * A subset of https://docs.joinmastodon.org/entities/status/ 
 */
type StatusBase = z.infer<typeof StatusBase>
const StatusBase = z.object({
    /** Really should just be used for pagination with max_id */
    id: z.string(),

    /**
     * ex: "2019-12-08T03:48:33.901Z"
     */
    created_at: z.string(),
    account: Account,

    /**
     * A link to the status's HTML representation.
     * 
     * ... Well, so say the docs at https://docs.joinmastodon.org/entities/Status/#url
     * However, when a status is a reblog, you get a URL in the format:
     * https://mastodon.social/users/{username}/statuses/{statusID}/activity
     * // Which is NOT an HTML representation. 
     */
    url: z.string().nullable().optional(),

    /**
     * A link to the status's URI, used for federation:
     */
    uri: z.string(),

    content: z.string(),
    visibility: z.enum(["public", "unlisted", "private", "direct"]),
    spoiler_text: z.string().optional(),
    media_attachments: Attachment.array()
}).passthrough()

// Make Status recursive:
export type Status = StatusBase & {
    reblog?: Status | null
}
const Status: z.ZodType<Status> = StatusBase.extend({
    reblog: z.lazy(() => Status.nullable().optional())
}).passthrough()

export interface StatusContext {
    status: Status,

    /** Additional context about the Status, not included in its JSON */
    readonly context: {
        // Necessary for constructing instance-local links.
        baseURL: string
    }
}



