import { getOptions, loadConfig, Config } from "./priv/config.ts"
import { feoblog, nhm, path } from "./priv/deps.ts";
import * as mast from "./priv/mast.ts";

async function main(): Promise<number> {
    const options = getOptions()
    const config = await loadConfig(options.config)

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

        // DEBUG:
        if (item.status.content.search("#") >= 0) {
            console.log("content:", item.status.content)
            console.log("markdown:", item.toMarkdown())
        }

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
    const SCOPE = "read"

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

const service = new nhm.NodeHtmlMarkdown({
    // https://github.com/crosstype/node-html-markdown#readme
})

function htmlToMarkdown(html: string|undefined): string {
    return service.translate(html || "")
}


/** Some utility functions on top of a mast.Status */
class StatusItem {
    timestamp: number;

    constructor(
        public readonly status: mast.Status,
    ) {
        const date = Date.parse(status.created_at)
        this.timestamp = date.valueOf()
    }

    get isPublic(): boolean {
        const v = this.status.visibility
        return v === "public" || v === "unlisted"
    }

    toMarkdown(): string {
        const s = this.status

        let name = s.account.acct
        if (s.account.display_name && name.search(s.account.display_name) < 0) {
            name += ` ("${s.account.display_name}")`
        }
        const statusURL = s.url || s.uri
        let header = `[${name}](${s.account.url}) [wrote](${statusURL}):`

        if (!s.reblog) {
            header = `[${name}](${s.account.url}) [wrote](${statusURL}):`
        } else {
            let rName = s.reblog.account.acct
            if (s.reblog.account.display_name && rName.search(s.reblog.account.display_name) < 0) {
                rName += ` ("${s.reblog.account.display_name}")`
            }
            const rURL = s.reblog.url || s.reblog.uri
            header = (
                `[Reblogged](${statusURL}) by [${name}](${s.account.url}):`
                + "  \n" // Force a <br>
                + `[${rName}](${s.reblog.account.url}) [wrote](${rURL}):`
            )
        }

        const parts = [
            header,
            "",
            htmlToMarkdown(`<blockquote>${s.content}</blockquote>`)
        ]

        // Link to attached media. (But don't inline it. Seems rude to use remote bandwidth for Mastodon servers.)
        // Though, maybe we could optionally attach it to the FeoBlog post? 🤔
        if (s.media_attachments.length > 0) {
            parts.push("")
            parts.push("### Attachments: ###")
            parts.push("")
            
            for (const attachment of s.media_attachments) {
                const desc = attachment.description || path.basename(attachment.url)
                let link = `[${desc}](${attachment.url})`
                if (attachment.remote_url) {
                    link += ` ([remote](${attachment.remote_url}))`
                }
                parts.push(` * ${link}`)
            }
        }

        return parts.join("\n")
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
}
    

// ---------------------
try {
    Deno.exit(await main() || 0)
} catch (error) {
    console.error(error)
    Deno.exit(1)
}

