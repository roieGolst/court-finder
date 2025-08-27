# Court Finder

A CLI tool to scan for available tennis courts on tennis.org.il.

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

### Basic Scan
```bash
npm run scan
```

### Command Line Options

- `--days <number>` - Number of days to scan ahead (default: 14)
- `--start <time>` - Start time in HH:MM format (default: 20:00)
- `--end <time>` - End time in HH:MM format (default: 23:00)
- `--step <minutes>` - Time step in minutes (default: 30)
- `--duration <hours>` - Booking duration in hours (default: 2)
- `--unit <id>` - Tennis center unit ID (default: 11)
- `--type <id>` - Court type ID (default: 1)
- `--concurrency <number>` - Concurrent requests (default: 6)
- `--headful` - Run browser in visible mode
- `--login` - Force new login (clears saved session)

### Examples

```bash
# Scan for 7 days with different time range
npm run scan -- --days 7 --start 18:00 --end 22:00

# Force new login and run in visible browser
npm run scan -- --login --headful

# Scan with 1-hour duration and 15-minute steps
npm run scan -- --duration 1 --step 15
```

## First Run

On first run, the tool will open a browser window for you to login to tennis.org.il. Your session will be saved and reused for subsequent runs.

## Output

The tool displays available courts in a table format showing:
- Date
- Time slot
- Number of available courts
- Court numbers