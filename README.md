# Calorie Count

A website for looking up calorie and nutrition data across fruit, vegetables,
dry fruits & nuts, meat & fish, snacks, and fast food — search by name, filter
by food type, open an item for its full nutrition breakdown, and send a note
through the contact form.

## Stack
- **Backend:** Node.js + Express, serving a small REST API over a local JSON dataset (`data/foods.json`)
- **Frontend:** plain HTML, CSS, and JavaScript (no build step, no framework)

## Project structure
```
calorie-count/
├── server.js            # Express server + API routes
├── package.json
├── data/
│   └── foods.json       # nutrition dataset — 88 items across 6 food types
└── public/
    ├── index.html
    ├── css/style.css
    └── js/script.js
```

## Run it
```bash
cd calorie-count
npm install
npm start
```
Then open **http://localhost:3000** in your browser.

## Food types in the dataset
`fruit` · `vegetable` · `dryfruit` (nuts & dried fruit) · `meat` (meat & fish) · `snack` · `fastfood`

## API endpoints
| Method | Route                                | Description                                            |
|--------|----------------------------------------|---------------------------------------------------------|
| GET    | `/api/foods`                          | List all items (summary fields)                         |
| GET    | `/api/foods?type=vegetable`           | List items of one type                                  |
| GET    | `/api/foods?type=snack&category=...`  | Filter by type and sub-category                          |
| GET    | `/api/foods/search?q=almond`          | Search by (partial) name, optionally `&type=`            |
| GET    | `/api/foods/:id`                      | Full nutrition detail for one item                       |
| GET    | `/api/types`                          | Distinct top-level food types (for the main filter tabs) |
| GET    | `/api/categories?type=fruit`          | Distinct sub-categories, optionally scoped to a type      |
| POST   | `/api/contact`                        | Contact form submission — `{ name, email, message }`      |

The contact form currently just validates the input and logs the submission
server-side (see `app.post("/api/contact", ...)` in `server.js`) — swap in a
real mail service (e.g. Nodemailer, SendGrid) there when you're ready to
actually receive messages by email.

## Extending it
- Add more items by appending objects to `data/foods.json` with a `type` field
  (one of the six above) — no code changes needed, the frontend reads types
  and cards straight from the API.
- To move from a JSON file to a real database later, only `server.js` needs to
  change — the frontend just calls the same `/api/*` routes.
