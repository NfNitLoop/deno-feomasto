import {NodeHtmlMarkdown} from "node-html-markdown"


// TODO: See:
// https://github.com/EvitanRelta/htmlarkdown

const service = new NodeHtmlMarkdown({
    // https://github.com/crosstype/node-html-markdown#readme

    // Thank you! :) https://github.com/crosstype/node-html-markdown/issues/15  
    useLinkReferenceDefinitions: true,
})



export function htmlToMarkdown(html: string): string {
    return service.translate(html)
}