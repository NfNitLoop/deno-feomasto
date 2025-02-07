[![JSR Version]][JSR Link]

mastodon-sync
=============

A tool to sync posts ("[Status]es") from [Mastodon] to [Diskuto].

To install with [Deno], run:

    deno install -RN --deny-env jsr:@diskuto/mastodon-sync

See [mastodon-sync.sample.toml] for sample configuration.

Then just periodically run `mastodon-sync run` to sync.

[Status]: https://docs.joinmastodon.org/entities/status/
[Mastodon]: https://en.wikipedia.org/wiki/Mastodon_(software)
[Diskuto]: https://github.com/diskuto
[Deno]: https://deno.com/
[mastodon-sync.sample.toml]: ./mastodon-sync.sample.toml

[JSR Version]: https://jsr.io/badges/@diskuto/mastodon-sync
[JSR Link]: https://jsr.io/@diskuto/mastodon-sync