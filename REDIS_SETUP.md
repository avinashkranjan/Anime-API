# Redis Caching Setup

This API now supports Redis caching as an alternative to the local Node.js in-memory cache. Redis provides better scalability, persistence, and distributed caching capabilities.

## Features

- **Dual Cache Support**: Seamlessly switch between Redis and Node.js in-memory cache
- **Automatic Fallback**: Falls back to Node.js cache if Redis is disabled or unavailable
- **LRU Eviction**: Redis is configured with `allkeys-lru` policy for automatic memory management
- **Connection Resilience**: Automatic reconnection with configurable retry attempts
- **Zero Downtime**: Cache operations are non-blocking and won't crash the API if they fail

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Redis Caching Configuration
REDIS_ENABLED=true
REDIS_URL=redis://default:password@host:port
REDIS_MAX_MEMORY=10gb
REDIS_EVICTION_POLICY=allkeys-lru
REDIS_MAX_RECONNECT_ATTEMPTS=50
REDIS_CONNECTION_POOL_SIZE=50

# Node Cache Configuration (used when Redis is disabled)
NODE_CACHE_TTL=86400
NODE_CACHE_CHECK_PERIOD=600
NODE_CACHE_MAX_KEYS=1000
```

### Redis Configuration Explained

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_ENABLED` | Enable/disable Redis caching | `false` |
| `REDIS_URL` | Redis connection URL | - |
| `REDIS_MAX_MEMORY` | Maximum memory for Redis | `10gb` |
| `REDIS_EVICTION_POLICY` | Memory eviction policy | `allkeys-lru` |
| `REDIS_MAX_RECONNECT_ATTEMPTS` | Max reconnection attempts | `50` |
| `REDIS_CONNECTION_POOL_SIZE` | Connection pool size | `50` |

### Node Cache Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_CACHE_TTL` | Default TTL in seconds | `86400` (1 day) |
| `NODE_CACHE_CHECK_PERIOD` | Check period for expired keys | `600` (10 min) |
| `NODE_CACHE_MAX_KEYS` | Maximum cache entries | `1000` |

## Setup Instructions

### Option 1: Using Redis Cloud (Recommended for Production)

1. Sign up for a free Redis Cloud account at [Redis Cloud](https://redis.com/try-free/)
2. Create a new database
3. Copy the connection URL (format: `redis://default:password@host:port`)
4. Set `REDIS_ENABLED=true` in your `.env` file
5. Set `REDIS_URL` to your Redis Cloud connection URL

### Option 2: Using Local Redis (For Development)

1. Install Redis locally:
   ```bash
   # macOS
   brew install redis
   brew services start redis
   
   # Ubuntu/Debian
   sudo apt-get install redis-server
   sudo systemctl start redis
   
   # Windows
   # Download from https://github.com/microsoftarchive/redis/releases
   ```

2. Set environment variables:
   ```env
   REDIS_ENABLED=true
   REDIS_URL=redis://localhost:6379
   ```

### Option 3: Using Docker

Run Redis in a Docker container:

```bash
docker run -d \
  --name anime-api-redis \
  -p 6379:6379 \
  redis:alpine \
  redis-server --maxmemory 10gb --maxmemory-policy allkeys-lru
```

Then set:
```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

## Using Node.js Cache (Default)

If you don't want to use Redis, simply set `REDIS_ENABLED=false` or omit it from your `.env` file. The API will use the built-in Node.js cache with the following defaults:

- Default TTL: 1 day
- Max Keys: 1000
- Automatic eviction when full

## Benefits of Redis

1. **Scalability**: Share cache across multiple API instances
2. **Persistence**: Cache survives server restarts
3. **Memory Management**: Automatic LRU eviction prevents memory overflow
4. **Performance**: Faster than disk-based caching
5. **Distributed**: Works seamlessly in containerized/serverless environments

## Monitoring

The cache system logs important events:

- **Redis Connected**: When connection to Redis is established
- **Redis Error**: If there are connection or operation errors
- **Cache Errors**: Non-fatal cache operation failures

Check your application logs for these messages to monitor cache health.

## Troubleshooting

### Redis Connection Failed

If you see "Failed to connect to Redis" errors:
1. Verify `REDIS_URL` is correct
2. Check if Redis server is running
3. Verify network connectivity and firewall rules
4. Check Redis authentication credentials

The API will continue to work without caching if Redis connection fails.

### Cache Not Working

1. Check if `REDIS_ENABLED=true` is set correctly
2. Verify the Redis connection is established (check logs)
3. Test Redis connection manually:
   ```bash
   redis-cli -u redis://your-url ping
   ```

### High Memory Usage

If Redis memory usage is too high:
1. Reduce `REDIS_MAX_MEMORY` in your configuration
2. Adjust TTL values for specific routes (see route configuration)
3. Consider using a more aggressive eviction policy

## Performance Tips

1. **Use Redis in Production**: Redis provides better performance and reliability
2. **Adjust TTL Values**: Balance between cache hit rate and data freshness
3. **Monitor Memory**: Keep an eye on Redis memory usage
4. **Use Connection Pooling**: Already configured with `CONNECTION_POOL_SIZE`
5. **Enable Persistence**: Configure Redis RDB or AOF for data durability (optional)

## Migration from Node.js Cache to Redis

The migration is automatic and requires no code changes:

1. Set `REDIS_ENABLED=true`
2. Configure `REDIS_URL`
3. Restart the API

The cache will be empty initially, but will populate as requests come in.

## Security Considerations

1. **Use Authentication**: Always use password-protected Redis URLs
2. **Network Security**: Use TLS for Redis connections in production
3. **Access Control**: Restrict Redis access to authorized IPs only
4. **Environment Variables**: Never commit `.env` file to version control

## Example Production Configuration

```env
# Production Redis Setup
REDIS_ENABLED=true
REDIS_URL=rediss://default:secure-password@production-redis.example.com:6380
REDIS_MAX_MEMORY=10gb
REDIS_EVICTION_POLICY=allkeys-lru
REDIS_MAX_RECONNECT_ATTEMPTS=50
REDIS_CONNECTION_POOL_SIZE=50

# Fallback Node Cache (if Redis fails)
NODE_CACHE_TTL=86400
NODE_CACHE_CHECK_PERIOD=600
NODE_CACHE_MAX_KEYS=1000
```

Note: `rediss://` (with double 's') indicates a TLS-encrypted connection.
