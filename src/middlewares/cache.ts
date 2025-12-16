import { Request, Response, NextFunction } from "express";
import NodeCache from "node-cache";
import Redis from "ioredis";
import { config } from "dotenv";

config();

interface CacheConfig {
  duration: number;
  keyParams?: string[]; // Specific query/body params to include in cache key
  ignoreParams?: string[]; // Params to exclude from cache key
  varyByHeaders?: string[]; // Headers to include in cache key
  customKeyGenerator?: (req: Request) => string; // Custom key generation function
}

interface CacheOptions {
  defaultTTL: number;
  checkPeriod?: number;
  maxKeys?: number;
}

interface CacheAdapter {
  get(key: string): Promise<any> | any;
  set(key: string, value: any, ttl: number): Promise<void> | void;
  del(key: string): Promise<void> | void;
  keys(): Promise<string[]> | string[];
  flushAll(): Promise<void> | void;
}

class NodeCacheAdapter implements CacheAdapter {
  private cache: NodeCache;

  constructor(options: CacheOptions) {
    this.cache = new NodeCache({
      stdTTL: options.defaultTTL,
      checkperiod: options.checkPeriod || 600,
      maxKeys: options.maxKeys || -1,
    });
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  set(key: string, value: any, ttl: number): void {
    try {
      this.cache.set(key, value, ttl);
    } catch (error: any) {
      // Handle ECACHEFULL error gracefully
      if (error.errorcode === 'ECACHEFULL') {
        // Clear 10% of the cache to make room for new entries
        const keys = this.cache.keys();
        const keysToDelete = Math.ceil(keys.length * 0.1);
        for (let i = 0; i < keysToDelete && i < keys.length; i++) {
          this.cache.del(keys[i]);
        }
        // Try to set the cache again after clearing space
        try {
          this.cache.set(key, value, ttl);
        } catch (retryError) {
          console.error('Failed to cache response after clearing space:', retryError);
        }
      } else {
        console.error('Cache error:', error);
      }
    }
  }

  del(key: string): void {
    this.cache.del(key);
  }

  keys(): string[] {
    return this.cache.keys();
  }

  flushAll(): void {
    this.cache.flushAll();
  }
}

class RedisCacheAdapter implements CacheAdapter {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || '';
    const maxReconnectAttempts = parseInt(process.env.REDIS_MAX_RECONNECT_ATTEMPTS || '50', 10);
    const connectionPoolSize = parseInt(process.env.REDIS_CONNECTION_POOL_SIZE || '50', 10);

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: maxReconnectAttempts,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > maxReconnectAttempts) {
          console.error('Redis: Max reconnection attempts reached');
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      console.log('Redis: Connected successfully');
      this.isConnected = true;
    });

    this.client.on('error', (err: Error) => {
      console.error('Redis connection error:', err);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis: Connection closed');
      this.isConnected = false;
    });

    // Connect to Redis
    this.client.connect().catch((err: Error) => {
      console.error('Failed to connect to Redis:', err);
    });
  }

  async get(key: string): Promise<any> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : undefined;
    } catch (error) {
      console.error('Redis get error:', error);
      return undefined;
    }
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis del error:', error);
    }
  }

  async keys(): Promise<string[]> {
    try {
      return await this.client.keys('*');
    } catch (error) {
      console.error('Redis keys error:', error);
      return [];
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.client.flushall();
    } catch (error) {
      console.error('Redis flushAll error:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

class AdvancedCache {
  private cacheAdapter: CacheAdapter;
  private defaultConfig: CacheConfig;
  private isAsync: boolean;

  constructor(options: CacheOptions) {
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    if (redisEnabled) {
      console.log('Initializing Redis cache...');
      this.cacheAdapter = new RedisCacheAdapter();
      this.isAsync = true;
    } else {
      console.log('Initializing Node cache...');
      this.cacheAdapter = new NodeCacheAdapter(options);
      this.isAsync = false;
    }

    this.defaultConfig = {
      duration: options.defaultTTL,
      keyParams: [],
      ignoreParams: [],
      varyByHeaders: [],
    };
  }

  /**
   * Generate a cache key based on request and configuration
   */
  private generateCacheKey(req: Request, config: CacheConfig): string {
    if (config.customKeyGenerator) {
      return config.customKeyGenerator(req);
    }

    const components: string[] = [req.method, req.path];

    // Add specified query parameters
    const queryParams: Record<string, any> = {};
    if (req.query) {
      Object.keys(req.query).forEach((key) => {
        if (
          (!config.keyParams?.length || config.keyParams.includes(key)) &&
          !config.ignoreParams?.includes(key)
        ) {
          queryParams[key] = req.query[key];
        }
      });
    }

    // Add specified body parameters for POST/PUT requests
    const bodyParams: Record<string, any> = {};
    if (req.body && (req.method === "POST" || req.method === "PUT")) {
      Object.keys(req.body).forEach((key) => {
        if (
          (!config.keyParams?.length || config.keyParams.includes(key)) &&
          !config.ignoreParams?.includes(key)
        ) {
          bodyParams[key] = req.body[key];
        }
      });
    }

    // Add specified headers
    const headers: Record<string, any> = {};
    if (config.varyByHeaders?.length) {
      config.varyByHeaders.forEach((header) => {
        const headerValue = req.get(header);
        if (headerValue) {
          headers[header] = headerValue;
        }
      });
    }

    // Combine all components into a single key
    components.push(
      JSON.stringify(queryParams),
      JSON.stringify(bodyParams),
      JSON.stringify(headers),
    );

    return components.join("|");
  }

  /**
   * Create middleware with specific cache configuration
   */
  middleware(config?: Partial<CacheConfig>) {
    const finalConfig: CacheConfig = { ...this.defaultConfig, ...config };

    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip caching for non-GET methods unless explicitly configured
      if (req.method !== "GET" && !config?.customKeyGenerator) {
        return next();
      }

      const cacheKey = this.generateCacheKey(req, finalConfig);
      
      try {
        const cachedResponse = this.isAsync 
          ? await this.cacheAdapter.get(cacheKey)
          : this.cacheAdapter.get(cacheKey);

        if (cachedResponse) {
          return res.json(cachedResponse);
        }
      } catch (error) {
        console.error('Error retrieving from cache:', error);
      }

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        // Cache the response asynchronously (don't block the response)
        if (this.isAsync) {
          (this.cacheAdapter.set(cacheKey, body, finalConfig.duration) as Promise<void>)
            .catch((error) => console.error('Error setting cache:', error));
        } else {
          this.cacheAdapter.set(cacheKey, body, finalConfig.duration);
        }
        return originalJson(body);
      };

      next();
    };
  }

  /**
   * Clear cache entries matching a pattern
   */
  async clearCache(pattern?: RegExp): Promise<void> {
    if (!pattern) {
      if (this.isAsync) {
        await this.cacheAdapter.flushAll();
      } else {
        this.cacheAdapter.flushAll();
      }
      return;
    }

    if (this.isAsync) {
      const keys = await this.cacheAdapter.keys() as string[];
      await Promise.all(
        keys.map((key) => {
          if (pattern.test(key)) {
            return this.cacheAdapter.del(key);
          }
          return Promise.resolve();
        })
      );
    } else {
      const keys = this.cacheAdapter.keys() as string[];
      keys.forEach((key) => {
        if (pattern.test(key)) {
          this.cacheAdapter.del(key);
        }
      });
    }
  }
}

const cacheManager = new AdvancedCache({
  defaultTTL: parseInt(process.env.NODE_CACHE_TTL || '86400', 10), // Default 1 day
  checkPeriod: parseInt(process.env.NODE_CACHE_CHECK_PERIOD || '600', 10),
  maxKeys: parseInt(process.env.NODE_CACHE_MAX_KEYS || '1000', 10),
});

export { cacheManager, AdvancedCache, CacheConfig, CacheOptions };
