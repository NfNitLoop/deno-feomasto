import {feoblog, toml} from "./deps.ts"

export interface Config {
    // The URL 
    url: string

    /** An API token for accessing Mastodon as a particular user */
    token?: string

    client: Client

    feoblog: FeoBlog
}

/** 
 * Credentials for the Mastodon OAuth Client we use to communicate w/ Mastodon.
 * You must create an OAuth client in your Developer settings in Mastodon.
 */
interface Client {
    key: string
    secret: string
}

interface FeoBlog {
    server: string,

    /** The feoblog we write to */
    write: {
        userID: string
        password: string
    }

    // TODO: read
}

export async function loadConfig(fileName: string): Promise<Config> {

    // deno-lint-ignore no-explicit-any
    const parsed: any = toml.parse(await loadFile(fileName))

    // TODO: use Zod for schema validation:
    
    // Defaults:
    const config: Config = {
        url: requireString("mastodon.url", parsed.mastodon?.url),
        token: requireString("mastodon.token", parsed.mastodon?.token || ""),
        client: {
            key: requireString("mastodon.client.key", parsed.mastodon?.client?.key || ""),
            secret: requireString("mastodon.client.secret", parsed.mastodon?.client?.secret || ""),
        },
        feoblog: {
            server: requireString("feoblog.server", parsed.feoblog?.server),
            write: {
                userID: requireString("feoblog.write.userID", parsed.feoblog?.write?.userID),
                password: requireString("feoblog.write.password", parsed.feoblog?.write?.password)
            }
        }
    }

    const privKey = await feoblog.PrivateKey.fromString(config.feoblog.write.password)
    const userID = feoblog.UserID.fromString(config.feoblog.write.userID)
    if (privKey.userID.toString() != userID.toString()) {
        throw `feoblog.write: Expected private key for ${userID} but found one for ${privKey.userID}`
    }

    return config
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