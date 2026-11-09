# Shuttle Scorer

Badminton tournament and match scoring. Next.js (App Router) + Supabase, built to deploy on Vercel and to be wrapped as an Android app later.

**What it does**

- Home screen: **Tournament** or **Casual match**.
- Creating a tournament asks for its **name** (plus optional venue and date).
- Inside a tournament: add **categories**, then **pools** (Group A, Group B ...), then **teams (doubles)** or **players (singles)**. Doubles asks for a team name and two player names; singles asks for one player name.
- Starting a match asks for the **number of sets** (1, 3 or 5) and **points per set** (11 / 15 / 21 / custom), the **first server**, and for doubles **who starts in the right court** on each side.
- The live screen shows the score, **who is serving and who is receiving**, and a court diagram with every player in their court. It marks set point and match point, prompts the 11-point interval and change of ends, and has **undo**.
- Every pool shows a live **ranking table** that follows the BWF group order.
- Every match (rally by rally) is saved, per team and per category.
- **Golden point** (no deuce) can be switched on for any match: at 20-20 in a 21-point set the next point wins.
- **Tie-break rules are selectable** per tournament: for two level teams use head-to-head or a decider match; for three or more use set and points difference or decider matches.
- **Knockout stage**: when every pool match is played, choose semi-finals or quarter-finals. The app maps the teams across pools (for example Group A winner vs Group B runner-up), builds the bracket, and moves winners forward through the final and third-place match.
- **Admin console and roles**: sign in as Admin or User. Admins have full rights, see every tournament and manage accounts (create, assign to tournaments, reset passwords, delete, and set an automatic deletion time). Users score matches only in the tournaments assigned to them.
- Tournament data (and casual matches) are deleted automatically **3 months** after creation.

## 1. Set up Supabase (5 minutes)

**Upgrading from an earlier version?** Re-run the whole `supabase/schema.sql` in the SQL Editor once. It is safe to run again and only adds the new columns.

1. Create a free project at <https://supabase.com>.
2. **SQL Editor -> New query**, paste all of `supabase/schema.sql`, click **Run**.
3. **Authentication -> Users -> Add user**: create your organiser login (email + password). Tick "Auto confirm user".
4. **Authentication -> Sign In / Providers -> Email**: switch **off** "Allow new users to sign up" so nobody else can create an account.
5. **Project Settings -> API**: copy the **Project URL**, the **anon public** key and the **service_role** key.

### Admin console, users and logins

- **Sign-in:** the login screen asks whether you are signing in as **Admin** or **User**. The account must match the choice. Public sign-up stays off, so only accounts an admin creates can sign in.
- **Admin:** full rights over every tournament and every account. The login you made in Supabase keeps working as an admin. Admins can also create more admins.
- **User:** an account an admin creates for scoring. A user sees only the tournaments assigned to them and can start and score matches there. They cannot change teams, categories, pools or rules, create the knockout stage, delete anything, create tournaments, or score casual matches.
- **Admin console** (the shield icon in the header, or the card on the home page):
  - *Overview*: tournaments, live matches, accounts, and accounts about to be deleted.
  - *Users*: create accounts (email, password, type), assign or remove tournament access, reset passwords, delete accounts, and set the **automatic deletion time**.
  - *Tournaments*: every tournament with its categories, matches, live matches and assigned users; open or delete any of them.
- **Automatic deletion:** when creating a user (or later, from the user's row) choose *never*, 1/3/7/30/90 days, or an exact date and time. When the time passes the account **loses all access immediately** (enforced in the database) and is signed out. The account itself is deleted by the daily cleanup job, or as soon as an admin opens the Users list. Matches the account scored are kept and handed to an admin.
- The tournament page has a **Users with access** card to assign existing users quickly.

Needs `SUPABASE_SERVICE_ROLE_KEY` on the server (already used by the cleanup job). It must never be committed to GitHub or exposed to the browser. After updating, re-run `supabase/schema.sql` once.

## 2. Run it locally (optional)

```bash
npm install
cp .env.example .env.local     # then fill in the 4 values
npm run dev                    # http://localhost:3000
npm test                       # scoring, standings and knockout tests
```

## 3. Deploy to Vercel

1. Push this folder to a new GitHub repository.
2. At <https://vercel.com/new> import the repository. Framework is detected as Next.js; keep the defaults.
3. Before the first deploy, add these **Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret, server only) |
| `CRON_SECRET` | any long random string |

4. Click **Deploy**. Every later `git push` redeploys automatically.
5. The daily cleanup is already configured in `vercel.json` (03:00 IST). It calls `/api/cron/cleanup`, protected by `CRON_SECRET`. Check it under the project's **Settings -> Cron Jobs**.

**Using a domain from Hostinger:** in Vercel go to **Settings -> Domains**, add your domain, then create the DNS records Vercel shows in Hostinger's DNS zone editor.

## 4. Rules implemented

Scoring (`src/lib/scoring/engine.ts`, pure TypeScript, fully tested):

- Rally scoring: a point on every rally. A set is won at the target (21) with a 2-point lead; at the cap (30) the next point wins (30-29). Target and cap are configurable, and the cap can be switched off.
- Serving: the server stands in the right court when their own score is even, left when odd; the receiver stands diagonally opposite.
- Doubles: the serving side swaps courts only after winning a point on serve (the same player keeps serving); the receiving side never swaps; whoever wins the rally serves next.
- The winner of a set serves first in the next set. Players choose their starting courts again before each set.
- Interval prompt when a side reaches half the set target (11 in a 21-point set); in the deciding set the ends change at the same moment, and ends change after every set.

Pool ranking (`src/lib/scoring/standings.ts`), BWF group order:

1. Matches won.
2. If exactly two are tied, the match between them.
3. If three or more are tied, game (set) difference, then points difference. If a tie narrows to two, head-to-head applies again.
4. Still level: shown as tied ("2=") because BWF settles it by drawing lots.

"Pts" in the table is wins x the tournament's *points per match win* (default 2, changeable on the tournament page). It never changes the order, which is by wins.

Tie-break options (Tournament page, **Ranking rules**):

- *Two teams level*: **Head-to-head** (BWF) or **Decider match**. A decider is offered on the pool card once all pool matches are done. It only settles the order and is not counted in played, won, lost, sets or points.
- *Three or more level*: **Set and points difference** (BWF) or **Decider matches**, played as a mini league among the level teams.

Knockout (`src/lib/knockout.ts`): pool winners are seeded first, then runners-up, in a standard bracket so the top seeds meet the lowest. Same-pool teams are kept apart in the first round where possible, and a bye goes to the top seed when the number of qualifiers is not a full bracket. Teams that are level on every rule can be ordered by hand (after a draw of lots) before the bracket is created.

> Please check the tie-break order against the current BWF General Competition Regulations for your event level. If your event uses a different order, only the `criteria` list in `standings.ts` needs to change.

## 5. Android later

1. **Now:** the app is an installable PWA. On an Android phone open the site in Chrome and choose **Add to Home screen**.
2. **Play Store:** wrap it with [Capacitor](https://capacitorjs.com). The simplest setup points the Android WebView at your deployed Vercel URL (`server.url`), so web updates reach the app without a new release. Add PNG icons (192 and 512 px) first.
3. The scoring engine and database are plain TypeScript and Supabase, so a React Native version would reuse them unchanged.

## 6. Not included yet

- Offline scoring (scores need a connection; unsaved points are retried automatically and the screen warns you).
- Knockout rounds after the pools.
- A public read-only link for spectators.
- Walkovers / retirements in the UI (the standings code already supports a winner override).

## Project layout

```
supabase/schema.sql          tables, 3-month expiry, row level security
src/lib/scoring/             engine, standings, tests
src/app/                     pages (home, login, tournaments, match setup, live match)
src/app/api/cron/cleanup     daily 3-month cleanup job
src/components/              court diagram, standings table, category manager
vercel.json                  cron schedule
```
