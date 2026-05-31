import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for general API calls
 * Allows 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

/**
 * Strict limiter for email-send triggers
 * Allows 10 campaign starts per 5 minutes per IP
 */
export const sendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many send requests, please slow down.' }
});
