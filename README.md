# Calorie Count

A website for looking up calorie and nutrition data across fruit, vegetables,
dry fruits & nuts, meat & fish, snacks, and fast food — search by name, filter
by food type, open an item for its full nutrition breakdown, and send a note
through the contact form.

## Stack
- **Backend:** Node.js + Express, serving a REST API over local JSON files
- **Frontend:** plain HTML, CSS, and JavaScript (no build step, no framework)

Account and contact data are stored in `user-data.json`. Account passwords are
stored as salted hashes. Keep this file private and do not commit it.
An existing `users.db` file is retained only as an unused backup; the server
does not read from or write to it.

## Project structure
```
calorie-count/
├── server.js            # Express server + API routes
├── package.json
├── foods.json           # nutrition dataset — 88 items across 6 food types
├── user-data.json       # created automatically for accounts and contact messages
├── index.html
├── login.html
├── signup.html
├── style.css
└── script.js
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
| POST   | `/api/auth/register`                  | Create an account and save it to `user-data.json`          |
| POST   | `/api/auth/login`                     | Verify account credentials                                 |
| POST   | `/api/contact`                        | Save `{ name, email, message }` to `user-data.json`        |

## Extending it
- Add more items by appending objects to `foods.json` with a `type` field
  (one of the six above) — no code changes needed, the frontend reads types
  and cards straight from the API.
- The private `user-data.json` file is created automatically if it does not
  exist. Back it up securely if you need to preserve account and message data.
