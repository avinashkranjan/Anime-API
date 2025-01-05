import rateLimit from "express-rate-limit";

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 10 minutes
  max: 500, // Limit each IP to 500 requests per `window` (here, per 15 minutes)
  standardHeaders: "draft-7", // Set `RateLimit` and `RateLimit-Policy`` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message:
    "Too many accounts created from this IP, please try again after 1 hour",
});
