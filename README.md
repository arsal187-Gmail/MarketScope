# MarketScope

**MarketScope** is a browser-based U.S. stock market overview application for exploring and comparing stock data in a searchable, sortable table.

The current version is a **frontend demonstration** built with HTML, CSS, and JavaScript. It displays a static dataset of 40 U.S. stocks. No account, database, or paid market-data service is required to try it.

**Live demo:** https://arsal187-gmail.github.io/MarketScope/  
The live demo opens directly to the stock table.

**Source code:** https://github.com/arsal187-Gmail/MarketScope

## Features

- **Stock table:** View stock details and financial metrics in one place.
- **Dynamic JSON columns:** Table column names are taken from the JSON data keys, rather than being limited to one fixed set of labels.
- **Search:** Find stocks by ticker symbol or company name.
- **Sector filter:** Display stocks from a selected sector.
- **Sortable columns:** Click a column heading to change the sort order.
- **Pagination:** Browse 20 stocks per page.
- **Wide-table navigation:** Scroll horizontally through financial metrics while keeping the ticker and company name columns visible.
- **Readable company names:** Company names can wrap onto two lines.
- **Date Range selector:** Choose **1 Week, 1 Month, 3 Months, 6 Months, 9 Months, or 1 Year**. The selection is currently a UI placeholder for future backend integration; it **does not change the data** in this demo.
- **Responsive layout:** The interface adapts to different browser widths.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript (no frontend framework required)
- JSON for local sample data
- Git and GitHub for version control and collaboration
- GitHub Pages for static website hosting

## Project structure

```text
MarketScope/
├── index.html                  # GitHub Pages entry point; redirects to stocks.html
├── stocks.html                 # Main application page
├── stocks.js                   # Data loading, table display and interactions
├── stocks.css                  # Stock-table and page styling
├── styles.css                  # Shared styles
├── data/
│   └── stock_universe_40.json # Static sample dataset of 40 U.S. stocks
└── README.md                   # Project documentation
```

## Run MarketScope locally

### Prerequisites

- A modern web browser (such as Chrome or Edge)
- Python 3 **or** another local HTTP server
- Git (only if cloning the repository)

### Step 1 — Download the code

Clone the repository:

```bash
git clone https://github.com/arsal187-Gmail/MarketScope.git
cd MarketScope
```

Alternatively, open the GitHub repository and select **Code → Download ZIP**, then extract the ZIP file.

### Step 2 — Start a local server

From the project folder, run:

```bash
python -m http.server 8001
```

If `python` is not recognized on your system, try `py -m http.server 8001` on Windows.

### Step 3 — Open the application

Visit:

```text
http://localhost:8001/
```

Or go directly to:

```text
http://localhost:8001/stocks.html
```

**Important:** Open the site through a local server rather than double-clicking `stocks.html`. Browsers can restrict JavaScript requests for JSON data when a page is opened using `file://`.

To stop the server, return to the terminal and press **Ctrl+C**.

## Working with the data

MarketScope currently reads its stock data from:

```text
data/stock_universe_40.json
```

The JavaScript builds table columns from fields in the JSON data. This makes it easier to add or change data fields without manually rewriting every table header. The stock ticker and company name have special display behavior, and new fields may need additional formatting rules in `stocks.js` or styling in `stocks.css`.

The current dataset is **static and unverified**. Figures are for educational and demonstration purposes, **not live market quotes** and **not investment advice**.

### Date Range behavior

The Date Range control offers six choices, but changing it does not yet request or calculate period-specific data. A future backend will be responsible for supplying the appropriate dataset for the selected range.

## Contributing

Friends and other developers are welcome to suggest improvements.

For collaborators who have been granted write access:

1. Clone the repository and create a branch for your work.
2. Make your changes and test the app locally.
3. Commit and push your branch.
4. Open a **pull request** on GitHub describing your changes.
5. Wait for a review before the changes are merged into `main`.

Example Git workflow:

```bash
git switch -c feature/my-improvement
# Make and test your changes
git add .
git commit -m "Describe the improvement"
git push -u origin feature/my-improvement
```

If you do not have write access, you can **fork** the public repository, make changes in your fork, and open a pull request to propose them.

Please do not commit passwords, API keys, personal information, or other secrets.

## Planned improvements

- Connect the Date Range control to a backend or API that supplies period-specific results.
- Add a verified data source and indicate when stock data was last updated.
- Expand testing for different JSON structures and additional columns.
- Improve usability and accessibility based on feedback.

## Project status

**Working frontend demo.** The table, search, sector filter, sorting, pagination, and static JSON loading are implemented. Live stock data and backend-driven date ranges are not yet available.

## Disclaimer

MarketScope is an educational and demonstration project. It is not a financial advisory service, and its sample stock figures should not be used to make investment decisions.
