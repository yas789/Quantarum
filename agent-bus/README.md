# Agent Bus

A local HTTP broker system for agent automation with support for various adapters to interact with your system and applications.

## Features

- **Local-First**: Runs entirely on your machine, keeping your data private
- **Extensible Adapter Architecture**: Easily add new adapters for different services
- **Secure**: No cloud dependencies, all communication happens locally
- **Cross-Platform**: Works on macOS, with planned support for Windows and Linux

## Installation

1. **Prerequisites**
   - Node.js 20 or later
   - npm or yarn
   - macOS (initial version)

2. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/agent-bus.git
   cd agent-bus
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

## Available Adapters

### Core Adapters

- **File System (fs)**: Read, write, and manage files and directories
- **Application (app)**: Launch and control applications
- **Clipboard**: Read from and write to the system clipboard
- **Calendar (calendar_local)**: Create and manage calendar events
- **Web Search**: Search the web using multiple search engines
- **Web Automation**: Control web browsers and automate web interactions

## Usage

### Starting the Broker

```bash
# Start the broker
node broker/broker.js
```

The broker will be available at `http://localhost:3000` by default.

### API Endpoints

- `GET /capabilities`: List all available tools and their capabilities
- `POST /invoke`: Execute a specific tool
- `POST /plan`: Generate a plan to achieve a goal

### Example API Requests

#### List Capabilities
```bash
curl http://localhost:3000/capabilities
```

#### Read a File
```bash
curl -X POST http://localhost:3000/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool":"fs","verb":"read","args":{"path":"/path/to/file.txt"}}'
```

#### Search the Web
```bash
curl -X POST http://localhost:3000/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool":"web.search","verb":"search","args":{"query":"quantum computing"}}'
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Test a specific adapter
npm test -- adapters/fs/cli.test.js
```

### Manual Testing

You can test each adapter directly using its CLI:

```bash
# Test filesystem operations
./adapters/fs/cli.js '{"verb":"read","args":{"path":"/path/to/file"}}'

# Test web search
./adapters/web/search/cli.js '{"verb":"web.search","args":{"query":"test search"}}'
```

## Security

- All operations are performed locally on your machine
- Sensitive operations require explicit confirmation
- Adapters run with the same permissions as the user who started the broker
- No data is sent to external servers except for web searches and API calls you explicitly make

## Development

### Project Structure

```
agent-bus/
├── adapters/           # Adapter implementations
│   ├── fs/             # Filesystem adapter
│   ├── app/            # Application control
│   ├── clipboard/      # Clipboard operations
│   ├── calendar_local/ # Calendar integration
│   └── web/            # Web-related adapters
│       ├── search/     # Web search
│       └── chatgpt/    # ChatGPT integration
├── broker/             # Broker server code
│   ├── logs/           # Log files
│   └── broker.js       # Main broker implementation
├── test/               # Test files
└── README.md           # This file
```

### Adding a New Adapter

1. Create a new directory in `adapters/`
2. Add a `cli.js` file that implements the adapter interface
3. Create a `manifest.yaml` file describing the adapter's capabilities
4. Register the adapter in `broker/adapters.js`

