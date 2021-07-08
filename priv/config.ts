import {args, toml} from "./deps.ts"

const CLI_OPTIONS = (
    args.args
    .describe("A tool to sync Mastodon/FeoBlog")
    .with(args.PartialOption("config", {
        type: args.Text,
        describe: "Config file to use",
        default: "./feomasto.toml"
    }))
)

export function getOptions() {
    const result = CLI_OPTIONS.parse(Deno.args)
    if (result.error) {
        throw {
            context: "Error parsing CLI options",
            error: result.error,
        }
    }
    return result.value
}

export interface Config {
    // The URL 
    url: string

    /** An API token for accessing Mastodon as a particular user */
    token?: string

    client: Client
}

/** 
 * Credentials for the Mastodon OAuth Client we use to communicate w/ Mastodon.
 * You must create an OAuth client in your Developer settings in Mastodon.
 */
interface Client {
    key: string
    secret: string
}

export async function loadConfig(fileName: string): Promise<Config> {

    // deno-lint-ignore no-explicit-any
    const parsed: any = toml.parse(await loadFile(fileName))

    // TODO: https://www.npmjs.com/package/yup might be good for easier validation?
    
    // Defaults:
    return {
        url: requireString("mastodon.url", parsed.mastodon?.url),
        token: requireString("mastodon.token", parsed.mastodon?.token || ""),
        client: {
            key: requireString("mastodon.client.key", parsed.mastodon?.client?.key || ""),
            secret: requireString("mastodon.client.secret", parsed.mastodon?.client?.secret || ""),
        },
    }    
}

function requireString(name: string, value: unknown): string {
    if (typeof value === "string") { return value }
    throw `Expected "${name}" to be string, but was: ${typeof value}`
}

async function loadFile(fileName: string): Promise<string> {
    try {
        return await Deno.readTextFile(fileName)
    } catch (error) {
        throw new Error(`Error reading file "${fileName}": ${error}`)
    }
}