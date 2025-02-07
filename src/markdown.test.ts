import { htmlToMarkdown } from "./markdown.ts"
import { assertEquals } from "@std/assert";
import outdent from 'jsr:@cspotcode/outdent@0.8.0';



// Make sure spacing is maintained between links.
// See: https://github.com/crosstype/node-html-markdown/issues/16
Deno.test("links with spaces", () => {
    assertRenders(
        `<a href="https://www.google.com/">Link One</a> <a href="https://www.example.com/">Link Two</a>`,
        outdent`
            [Link One][1] [Link Two][2]
            
            [1]: https://www.google.com/
            [2]: https://www.example.com/
        `
    )
});


// Multi-line alt text flows through to the markdown.
// BUT! this is still a valid markdown link. Interesting!
Deno.test(function multiLineAlt() {
    assertRenders(
        `<img src="https://example.com" alt="some\nalt text"/>`,
        outdent`
            ![some
            alt text](https://example.com)
        `
    )
})

// Interestingly, multi-line link text (which gets output into a very similar Markdown node)
// DOES have newlines automatically removed:
Deno.test(function multiLineLinks() {
    assertRenders(
        `<a href="https://www.google.com/">Here is some text \n with <br/> a break.</a>`,
        outdent`
            [Here is some text with   a break.][1]

            [1]: https://www.google.com/
        `
    )
})


function assertRenders(html: string, expected: string) {
    const rendered = htmlToMarkdown(html)
    assertEquals(expected, rendered)
}

