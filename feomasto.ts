import { getOptions, loadConfig, Config } from "./priv/config.ts"
import { nhm, path } from "./priv/deps.ts";
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

    const statuses: StatusItem[] = []
    for (const status of await client.homeTimeline()) {
        const item = new StatusItem(status)
        if (!item.isPublic) { continue }

        console.log(item)
        statuses.push(item)
    }

    for (const status of statuses) {
        console.log(status.toMarkdown())
        console.log()
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

    // TODO: Direct user here.
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
    if (token) {
        console.log([
            "Success!",
            "Update your config to match:",
            "",
            "[mastodon]",
            `url = "${baseURL}"`,
            `token = "${token}"`,
        ].join("\n"))
    }

    return await 0
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
}
    

// ---------------------
try {
    Deno.exit(await main() || 0)
} catch (error) {
    console.error(error)
    Deno.exit(1)
}

