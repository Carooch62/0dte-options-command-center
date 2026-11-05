# Robinhood hosted read-only monitor: Support request

Robinhood's external-agent onboarding page lists ChatGPT and Codex but says other platforms should contact Support. Our Cloudflare Worker is a separate hosted OAuth client; the existing ChatGPT connection does not grant it ongoing access. Manual owner-authorized equity quote retrieval succeeded on November 5, 2026. Automated quote polling has never been enabled.

## Message for the account owner to send to Robinhood Support

> I have a personal read-only options research monitor hosted on Cloudflare Workers. It uses my separately authorized Robinhood Trading MCP OAuth client (authorization-code PKCE, resource https://agent.robinhood.com/mcp/trading) and requests only get_option_chains, get_option_instruments and get_option_quotes. It does not place or preview orders. May I run the hosted client unattended during market hours, requesting at most three exact option contracts once every five minutes, subject to your limits? Does this require a registered or approved platform, additional permission, or a market-data subscription? What refresh-token or renewal method is supported for this client so it can continue without me manually signing in? Can the MCP return or document an exact Robinhood app/web URL that opens a specific option instrument UUID for review without submitting an order? If not, what supported link should an alert use? Please specify applicable rate limits, quote redistribution or notification rules, and whether stock/option quotes may be delivered to my private Discord channel.

Do not include account numbers, OAuth codes, access tokens, or webhook URLs in the request. Share the callback URI only if Robinhood specifically asks for it via an authenticated support channel. Preserve any response to determine whether we can activate the opt-in quote pilot and how to build the exact link resolver.

## Delivery status

`watch-alert-delivery.js` is an isolated, opt-in Discord delivery boundary with a retry marker. No scheduled job calls it. The owner chose Discord notifications to keep delivery free, and the previous SMS adapter and configuration have been removed. Existing Discord webhook messages are separate delayed research notifications. The final option alert requires a provider-verified exact Robinhood link and a fresh, qualified option quote.
