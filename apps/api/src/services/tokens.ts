import { redis } from "../redis.js";
import { config } from "../config.js";
import { TokenService } from "../lib/tokens.js";

export const tokens = new TokenService(
  redis,
  config.jwtAccessSecret,
  config.jwtRefreshSecret,
  config.jwtAccessExpiresSec,
  config.jwtRefreshExpiresSec,
);
