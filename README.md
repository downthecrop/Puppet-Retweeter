# Puppet-Retweeter  
Keep following accounts that have blocked you by mirroring their public tweets to a protected relay account.

## Quick start
```bash
git clone https://github.com/downthecrop/Puppet-Retweeter.git
cd Puppet-Retweeter
npm i
cp .env.example .env   # fill in the values
npm start
```

## Required `.env` keys
| Variable | Description |
|----------|-------------|
| `TWITTER_APP_KEY` / `TWITTER_APP_SECRET` | Keys from X developer portal |
| `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_SECRET` | User tokens for the retweet account |
| `TARGET_USERNAME` | Account to mirror (no `@`) |
| `NITTER_BASE` | Nitter URL that supports RSS, e.g. `https://nitter.privacyredirect.com` |

Optional flags: `INCLUDE_REPLIES`, `INITIAL_FETCH`

---

## Getting X developer keys
1. Log in with the retweet account.  
2. Visit https://developer.x.com → create a **Free** account project.  
3. Inside the project create an **App** → set permissions to **Read + Write**.  
4. Under *Keys & Tokens* generate:  
   - API Key & Secret → `TWITTER_APP_KEY`, `TWITTER_APP_SECRET`  
   - Access Token & Secret → `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` *Keys Require Read/Write*

---

## Nitter instance
Pick a host that serves RSS.  
Check uptime & RSS support at https://status.d420.de/ or similar lists.

If no suitable public instance is available, run your own:  
https://github.com/zedeus/nitter

---

## How it works
```text
Nitter RSS → parse IDs → POST /2/users/:id/retweets
             (no API)       (one write per tweet)
```
* **Read**: fetches the RSS feed `https://<nitter-host>/<user>/rss`, parses `<item>` GUIDs.  
* **Write**: calls the single X endpoint that retweets a given ID.

State is kept in `state.json`; the script polls every 10 minutes.

---

## Privacy & blocks
* Retweets from **protected accounts** are invisible to the public.  
* If the source account blocks your retweet account, the relay will break.

---

## License
MIT