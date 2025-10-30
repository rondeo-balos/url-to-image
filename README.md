# HTML to Image Server 📸

A high-performance Node.js server that converts any URL to optimized WebP images using Puppeteer and Sharp.

## Features

- 🚀 **Fast & Reliable**: Uses headless Chrome via Puppeteer for high-quality screenshots
- 🖼️ **WebP Optimization**: Automatic conversion to WebP format with configurable quality
- 🔧 **Flexible API**: Support for custom dimensions, quality settings, and capture options
- 🛡️ **Security**: Rate limiting, CORS, and security headers
- 📱 **Responsive**: Configurable viewport sizes and full-page capture
- ⚡ **Performance**: Persistent browser instance for faster response times

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd html-to-image

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start the server
npm start
```

### Development

```bash
# Start with auto-reload
npm run dev
```

## API Usage

### Basic Screenshot

```bash
# Simple screenshot with default settings
curl "http://localhost:3000/screenshot?url=https://example.com" -o screenshot.webp

# Custom dimensions
curl "http://localhost:3000/screenshot?url=https://example.com&width=1920&height=1080" -o screenshot.webp

# High quality with full page
curl "http://localhost:3000/screenshot?url=https://example.com&width=1200&height=800&quality=95&fullPage=true" -o screenshot.webp
```

### POST Request for Complex Options

```bash
curl -X POST http://localhost:3000/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "options": {
      "width": 1920,
      "height": 1080,
      "quality": 90,
      "fullPage": true,
      "waitUntil": "networkidle0",
      "timeout": 45000
    }
  }' -o screenshot.webp
```

## API Endpoints

### `GET /screenshot`

Capture a screenshot of the specified URL.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | URL to capture (must include http:// or https://) |
| `width` | number | 1200 | Screenshot width (100-4000px) |
| `height` | number | 800 | Screenshot height (100-4000px) |
| `quality` | number | 80 | WebP quality (1-100) |
| `fullPage` | boolean | false | Capture full page height |
| `waitUntil` | string | networkidle2 | When to consider loading finished |
| `timeout` | number | 30000 | Navigation timeout in milliseconds |

**Example:**
```
GET /screenshot?url=https://github.com&width=1200&height=800&quality=85
```

### `POST /screenshot`

Capture a screenshot with complex options via JSON body.

**Request Body:**
```json
{
  "url": "https://example.com",
  "options": {
    "width": 1920,
    "height": 1080,
    "quality": 95,
    "fullPage": true,
    "waitUntil": "networkidle0",
    "timeout": 45000
  }
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-31T10:30:00.000Z",
  "uptime": 1234.567
}
```

### `GET /api/docs`

Get API documentation.

## Configuration Options

### Wait Until Options

- `load` - Consider navigation finished when the load event is fired
- `domcontentloaded` - Consider navigation finished when DOMContentLoaded is fired
- `networkidle0` - Consider navigation finished when there are no network connections for at least 500ms
- `networkidle2` - Consider navigation finished when there are no more than 2 network connections for at least 500ms

### Environment Variables

Create a `.env` file from `.env.example`:

```env
PORT=3000
NODE_ENV=development
DEFAULT_WIDTH=1200
DEFAULT_HEIGHT=800
DEFAULT_QUALITY=80
MAX_TIMEOUT=60000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

**Error Response Format:**
```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Performance Tips

1. **Reuse Browser Instance**: The server maintains a persistent browser instance for better performance
2. **Optimize Quality**: Use quality 80-85 for good balance between file size and quality
3. **Set Appropriate Timeouts**: Increase timeout for complex pages
4. **Use Network Idle**: `networkidle2` is usually sufficient and faster than `networkidle0`

## Docker Deployment

```dockerfile
# Dockerfile example
FROM node:18-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
EXPOSE 3000

CMD ["npm", "start"]
```

## Rate Limiting

Default rate limits:
- 100 requests per 15 minutes per IP
- Configurable via environment variables

## Security Features

- CORS enabled
- Security headers via Helmet
- Rate limiting
- URL validation
- Input sanitization

## Browser Configuration

The server launches Chromium with optimized flags for server environments:
- Headless mode
- No sandbox (for container compatibility)
- Disabled GPU acceleration
- Memory optimizations

## Troubleshooting

### Common Issues

1. **Memory Issues**: Increase server memory or reduce concurrent requests
2. **Timeout Errors**: Increase timeout for slow-loading pages
3. **Permission Denied**: Ensure proper file permissions for Puppeteer
4. **Chrome Installation**: Make sure Chrome/Chromium is properly installed

### Logs

The server provides detailed logging for debugging:
- Request details
- Screenshot parameters
- Error messages
- Performance metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details