import * as toml from "@std/toml"
import * as diskuto from "@diskuto/client"
import * as z from "zod"

export async function loadConfig(fileName: string): Promise<Config> {
    const parsed = toml.parse(await loadFile(fileName))
    return Config.parse(parsed)
}


type Mastodon = z.infer<typeof Mastodon>
const Mastodon = z.object({
    url: z.string().url(),
    token: z.string(),
}).strict()


type DiskutoWrite = z.infer<typeof DiskutoWrite>
const DiskutoWrite = z.object({
    userID: z.string().min(1).transform(toUserID),
    password: z.string().min(1).transform(toPrivateKey)
}).strict()

type Diskuto = z.infer<typeof Diskuto>
const Diskuto = z.object({
    apiUrl: z.string().url(),
    write: DiskutoWrite
}).strict()

export type Config = z.infer<typeof Config>
const Config = z.object({
    mastodon: Mastodon,
    diskuto: Diskuto,
}).strict()

function toUserID(arg: string, ctx: z.RefinementCtx) {
    try {
        return diskuto.UserID.fromString(arg)
    } catch (err) {
        ctx.addIssue({
            code: "custom",
            message: `${err}`
        })
        return z.NEVER
    }
}

function toPrivateKey(arg: string, ctx: z.RefinementCtx) {
    try {
        return diskuto.PrivateKey.fromBase58(arg)
    } catch (err) {
        ctx.addIssue({
            code: "custom",
            message: `${err}`
        })
        return z.NEVER
    }
}








async function loadFile(fileName: string): Promise<string> {
    try {
        return await Deno.readTextFile(fileName)
    } catch (cause) {
        throw new Error(`Error reading file "${fileName}"`, { cause })
    }
}

