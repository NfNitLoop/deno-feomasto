import { htmlToMarkdown } from "./markdown.ts"
import { assertEquals } from "@std/assert";


// Make sure spacing is maintained between links.
// See: https://github.com/crosstype/node-html-markdown/issues/16
Deno.test("links with spaces", () => {
    assertRenders(
        `<a href="https://www.google.com/">Link One</a> <a href="https://www.example.com/">Link Two</a>`,
        [
            "[Link One][1] [Link Two][2]",
            "",
            "[1]: https://www.google.com/",
            "[2]: https://www.example.com/",
        ].join("\n")
    )
});




function assertRenders(html: string, expected: string) {
    const rendered = htmlToMarkdown(html)
    assertEquals(expected, rendered)
}

