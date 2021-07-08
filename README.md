FeoMasto
========

A tool to sync posts ("[Status]es") from [Mastodon] to [FeoBlog].

To install with [Deno], run:

    deno install --allow-read --allow-net https://deno.land/x/feomasto/feomasto.ts

See [feomasto.toml.sample] for sample configuration.

Then just periodically run `feomasto` to sync.

[Status]: https://docs.joinmastodon.org/entities/status/
[Mastodon]: https://en.wikipedia.org/wiki/Mastodon_(software)
[FeoBlog]: https://github.com/nfnitloop/feoblog
[Deno]: https://deno.land/
[feomasto.toml.sample]: ./feomasto.toml.sample