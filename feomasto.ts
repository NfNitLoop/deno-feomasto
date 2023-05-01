import { loadConfig, Config } from "./priv/config.ts"
import { feoblog, path, command, color } from "./priv/deps.ts";
import { htmlToMarkdown } from "./priv/markdown.ts";
import * as mast from "./priv/mast.ts";

const MAIN = new command.Command()
    .name("feomasto")
    .description("A tool to sync Mastodon/FeoBlog")
    .globalOption(
        "-c, --config <config:string>",
        "Config file to use",
        { default: "./feomasto.toml" }
    )
    .globalOption(
        "--maxStatuses <maxStatuses:number>",
        "Max # statuses to read from Mastodon",
        { default: 500 }
    )
    .action(() => {
        MAIN.showHelp()
    })

async function main(args: string[]) {
    try {
        await MAIN.parse(args)
        return 0
    } catch (cause) {
        console.error(cause)
        return 1
    }
}

async function run(options: RunOptions): Promise<number> {
    const config = await loadConfig(options.config)

    // TODO: If I only need the client key/secret to get a token, then
    // why put them in the config?  Let's refactor this to be an interactive
    // flow.  Use cliffy for nice prompts.
    if (!config.token) {
        return await getApiKey(config)
    }

    const client = new mast.Client({
        baseURL: config.url,
        token: config.token
    })

    // Find the last status saved in FeoBlog.
    let lastTimestamp: number|undefined = undefined
    const fbClient = new feoblog.Client({baseURL: config.feoblog.server})
    const userID = feoblog.UserID.fromString(config.feoblog.write.userID)
    for await(const entry of fbClient.getUserItems(userID)) {
        if (entry.item_type != feoblog.protobuf.ItemType.POST) {
            continue
        }
        lastTimestamp = entry.timestamp_ms_utc
        break        
    }

    // Collect statuses we haven't saved yet:
    const newStatuses: StatusItem[] = []
    for await (const status of client.homeTimeline()) {
        const item = new StatusItem(status)
        if (lastTimestamp && item.timestamp <= lastTimestamp) { break }
        if (!item.isPublic) { continue }

        newStatuses.push(item)
        if (newStatuses.length >= options.maxStatuses) { break }
    }

    console.log("Found", newStatuses.length, "new statuses")

    // Insert oldest first, so that we can resume if something goes wrong:
    newStatuses.sort(StatusItem.sortByTimestamp)

    const privKey = await feoblog.PrivateKey.fromString(config.feoblog.write.password)
    for (const status of newStatuses) {
        const bytes = status.toItem().serialize()
        const sig = privKey.sign(bytes)
        await fbClient.putItem(userID, sig, bytes)
    }

    return 0
}

MAIN.command("run", "Read from Mastodon into FeoBlog")
    .action(run)


async function test(options: RunOptions, maxStatuses: number) {
    const config = await loadConfig(options.config)
    const client = getMastodonClient(config)

    // Collect statuses we haven't saved yet:
    const statuses: StatusItem[] = []
    for await (const status of client.homeTimeline()) {
        const item = new StatusItem(status)
        if (!item.isPublic) { continue }

        statuses.push(item)
        if (statuses.length >= maxStatuses) { break }
    }
    console.log("Got", statuses.length, "statuses")

    if (statuses.length == 0) {
        return
    }

    for (const status of statuses) {
        status.debugPrint()
    }
}

/** Just read and render one text.  */
async function testStatus(options: RunOptions, statusText: string) {
    const pat = /\/(\d+)$/
    const match = pat.exec(statusText)
    if (!match) {
        throw new Error(`Invalid status ID: ${statusText}`)
    }
    let statusId = match[1]

    const config = await loadConfig(options.config)
    const client = getMastodonClient(config)


    let status = new StatusItem(await client.getStatus(statusId))

    status.debugPrint()
}

function getMastodonClient(config: Config) {
    if (!config.token) {
        throw new Error("You need a token first")
    }
    const client = new mast.Client({
        baseURL: config.url,
        token: config.token
    })
    return client
}

MAIN.command("test <count:number>", "Just run a test, don't write to FeoBlog")
    .action(test)
    // TODO: Aw, no multi-level subcommands?
    .command("test-status <id:string>", "Just test against one particular status")
    .action(testStatus)

interface RunOptions {
    config: string
    maxStatuses: number
}



// TODO: Move into the mastodon client?
// Prompt the user to create an API key.
async function getApiKey(config: Config): Promise<number> {
    
    if (!config.client.key) { throw `client.key is missing from your config` }
    if (!config.client.secret) { throw `client.secret is missing from your config` }

    // See: https://github.com/hylyh/node-mastodon/wiki/Getting-an-access_token-with-the-oauth-package
    // var oauth = new OAuth2('your_client_id', 'your_client_secret', 'https://mastodon.social', null, '/oauth/token');
    // var url = oauth.getAuthorizeUrl({ redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', response_type: 'code', scope: 'read write follow' });
    // // Get the user to open up the url in their browser and get the code

    // Cause the endpoint to SHOW the auth code instead of redirect: 
    const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"

    // oauth.getOAuthAccessToken('code from the authorization page that user should paste into your app', { grant_type: 'authorization_code', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' }, function(err, accessToken, refreshToken, res) { console.log(accessToken); })
    // TODO: Get from config:
    const baseURL = "https://mastodon.social"

    // See: https://docs.joinmastodon.org/client/authorized/
    const authCodeURL = new URL(`${baseURL}/oauth/authorize`)
    const params = authCodeURL.searchParams
    params.set("client_id", config.client.key)
    // params.set("scope", /* TODO */) 
    params.set("redirect_uri", REDIRECT_URI)
    params.set("response_type", "code")

    console.log("Visit the following URL in your web browser:")
    console.log(authCodeURL.toString())
    console.log()
    console.log("Grant access, then paste the code below.")
    
    const code = prompt("Code?\n:")
    if (!code) {
        console.error("No code entered")
        return 1
    }

    const req = new Request(`${baseURL}/oauth/token`, {
        method: "POST", 
        body: new URLSearchParams({
            "client_id": config.client.key,
            "client_secret": config.client.secret,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
            "code": code,
            // "scope": // TODO
        })
    })

    const response = await fetch(req)
    const body = await response.text()

    if (!response.ok) {
        console.error("Error getting API token from authorization code:")
        console.log("response", response)
        for (const [key, value] of response.headers) {
            console.log(key, "=", value)
        }
        console.log("body", body)
        return 1
    }

    const json = JSON.parse(body)
    const token = json.access_token
    if (!token) {
        throw {
            message: `Could not find access token in body`,
            response,
            body,
        }
    }

    console.log([
        "Success!",
        "Update your config to match:",
        "",
        "[mastodon]",
        `url = "${baseURL}"`,
        `token = "${token}"`,
    ].join("\n"))

    return 0
}

/** Some utility functions on top of a mast.Status */
class StatusItem {
    timestamp: number;

    constructor(
        public readonly context: mast.StatusContext,
    ) {
        const date = Date.parse(context.status.created_at)
        this.timestamp = date.valueOf()
    }

    private get status(): Readonly<mast.Status> { return this.context.status }

    /**
     * Get the instance-local URL for this status.
     * 
     * Mastodon doesn't give this to you in the JSON response, so we have to construct it from the
     * "context" of the request. (i.e.: the URL we made the request to.)
     * 
     * Benefits of using this format:
     * 1. We're likely syncing from the instance that the main user of this feed (me!) logs into.
     *    If we direct clicks there, that user is likely logged-in, and can immediately interact
     *    with the status. (vs. redirecting to status.url, where we're likely NOT logged in.)
     * 2. This instance-local status ID is attainable, so we can easily test against it.
     *    (Can't easily look up instance-remote URLs in a local instance's API for testing!)
     * 3. If some *other* user clicks on the instance-local URL, Mastodon will just forward
     *    them on to the origin URL anyway, so nothing is lost.
     */
    localURL(status?: mast.Status): string {
        status = status ?? this.status
        return `${this.localAccountURL(status.account)}/${this.localID}`
    }

    /** see notes in {@link localURL} */
    private localAccountURL(account: mast.Account): string {
        const baseURL = this.context.context.baseURL

        // "foo" for local users, else: "foo@remote.host"
        const userID = account.acct

        return `${baseURL}/@${userID}`
    }

    private accountLink(account: mast.Account) {
        let url = this.localAccountURL(account)
        let name = account.acct
        if (account.display_name && name.search(account.display_name) < 0) {
            name += ` ("${account.display_name}")`
        }
        return link(url, name)
    }

    /**
     * The URL of this status on its origin server.
     */
    get originURL(): string {
        let status = this.status
        return status.url || status.uri
    }

    /**
     * The ID of this status, but ONLY on the local mastodon instance!
     */
    get localID(): string {
        return this.status.id
    }

    get isPublic(): boolean {
        const v = this.status.visibility
        return v === "public" || v === "unlisted"
    }

    toMarkdown(): string {
        // Note: We emit HTML headers/footers and convert the whole thing to markdown
        // because that lets turndown create nice referenced links for us at the bottom
        // of the doc, which helps readability in un-rendered Markdown.
        
        const s = this.status
        const statusURL = this.localURL(s)

        let parts: string[] = []

        if (s.reblog) {
            const rURL = this.localURL(s.reblog)
            parts.push(
                `<p>${link(statusURL, "Reblogged")} by ${this.accountLink(s.account)}:`,
                `<br>${this.accountLink(s.reblog.account)} ${link(rURL, "wrote")}:`,
                "</p>",
                `<blockquote>`,
                s.reblog.content,
                `</blockquote>`
            )
        } 
        // TODO: Handle replies. Need to fetch reply-to, quote it.
        else {
            let header = 
            parts.push(
                `<p>${this.accountLink(s.account)} ${link(statusURL, "wrote")}:</p>`,
                `<blockquote>`,
                s.content,
                `</blockquote>`,
            )
        }

        let attachments = s.reblog?.media_attachments || s.media_attachments

        // TODO: DO inline. Links are ugly, it turns out.
        // Link to attached media. (But don't inline it. Seems rude to use remote bandwidth for Mastodon servers.)
        // Though, maybe we could optionally attach it to the FeoBlog post? 🤔
        if (attachments.length > 0) {
            parts.push("<h3>Attachments:</h3>")
            parts.push("<ul>")            
            for (const attachment of attachments) {
                const desc = attachment.description || path.basename(attachment.url)
                let item = link(attachment.url, desc)
                if (attachment.remote_url) {
                    item += ` (${link(attachment.remote_url, "remote")})`
                }
                parts.push(`  <li>${item}</li>`)
            }
            parts.push("</ul>")            
        }

        return htmlToMarkdown(parts.join("\n")) + this.embedFooter()
    }

    /** Extra info we embed in comments at the end. */
    private embedFooter(): string {
        let data: Record<string,unknown> = {}

        let local = this.localURL()
        let origin = this.originURL
        if (local != origin) {
            if (this.status.reblog) {
                // The URLs don't match because the origin URL here is a "reblog activity", which
                // isn't an HTML rendering of the thing.
                // We'll track it in the body, but no need to display/link to it.
                data.reblog = { activity: origin }
            } else {
                data.originURL = origin
            }
        }

        if (Object.getOwnPropertyNames(data).length == 0) {
            return ""
        }
        return [
            "", // Last line might not end in a newline.
            "", // extra separation from Markdown content.
            "<!--",
            JSON.stringify(data, null, 2),
            "-->"
        ].join("\n")
    }

    toItem(): feoblog.protobuf.Item {
        const item = new feoblog.protobuf.Item({
            timestamp_ms_utc: this.timestamp,
            // In theory, an ISO 8601 timestamp can contain an offset, but
            // mastodon.social always seems to return UTC times, so no offset.
        })

        item.post = new feoblog.protobuf.Post({
            body: this.toMarkdown()
        })

        return item
    }

    static sortByTimestamp(a: StatusItem, b: StatusItem) {
        return a.timestamp - b.timestamp
    }

    debugPrint() {
        console.log()
        console.log(`----------------------`)
        
        console.log(color.green("status JSON:"))
        console.log(JSON.stringify(this.status, null, 2))
        
        console.log()
        console.log(color.yellow("status.id"), this.status.id)
        console.log(color.blue("body:"))
        console.log(this.toItem().post.body)
    }
}

function link(href: string, text: string): string {
    text = text.replaceAll(`<`, "&lt;")

    // For links that are getting converted into markdown, newlines break them.
    text = text.replaceAll(`\n`, " ")

    return `<a href="${href}">${text}</a>`
}
    

// ---------------------
try {
    Deno.exit(await main(Deno.args) || 0)
} catch (error) {
    console.error(error)
    Deno.exit(1)
}

